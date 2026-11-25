import { useCallback, useEffect, useState } from 'react';
import { Download, Monitor, Printer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getSupabase, kitchenPairingCode } from '@/services/supabase/client';
import { useToast } from '@/providers/ToastProvider';
import { kitchenFailureMessage, kitchenNetworkHint } from '@/utils/kitchenPrinting';

type Destination = { mode: 'windows'; queue: string } | { mode: 'tcp'; host: string; port: number };
type Test = { id: string; at: string; state: string; destination: Destination | null; failure_code?: string | null };
type Settings = {
  paired: boolean; managed: boolean; enabled: boolean; machine: string | null; online: boolean;
  last_seen: string | null; queues: string[]; destination: Destination | null; test: Test | null;
};
const section = 'card space-y-4 p-5';
const quiet = 'text-sm text-cream-3';
const testLabels: Record<string, string> = {
  pending: 'Aguardando o computador', reserved: 'Preparando envio', sending: 'Enviando à impressora',
  retry: 'Impressora indisponível. O agente tentará novamente.', sent: 'Enviado. Confira o papel e o corte na cozinha.',
  review: 'Envio incerto. Confira o papel antes de repetir.', cancelled: 'Teste cancelado',
};
const destinationName = (d: Destination) => d.mode === 'windows' ? d.queue : d.host + ':' + d.port;
const localDate = (value: string) => new Date(value).toLocaleString('pt-BR');

type Call = <T>(name: string, args?: Record<string, unknown>) => Promise<T>;
class AccessExpired extends Error {}
async function request<T>(name: string, args = {}): Promise<T> {
  const { data, error } = await getSupabase().rpc(name, args);
  if (error) {
    if (error.code === '42501') throw new AccessExpired('Entre novamente para acessar as configurações.');
    const message = error.code === 'P0001' ? error.message : 'Não foi possível acessar a configuração da cozinha.';
    throw new Error(message);
  }
  return data as T;
}

function PrinterForm({ settings, refresh, rpc }: { settings: Settings; refresh: () => void; rpc: Call }) {
  const { destination, test } = settings;
  const [mode, setMode] = useState(destination?.mode ?? 'windows');
  const [queue, setQueue] = useState(destination?.mode === 'windows' ? destination.queue : '');
  const [host, setHost] = useState(destination?.mode === 'tcp' ? destination.host : '');
  const [port, setPort] = useState(destination?.mode === 'tcp' ? String(destination.port) : '9100');
  const [enabled, setEnabled] = useState(settings.enabled);
  const [busy, setBusy] = useState('');
  const toast = useToast();
  const proposed: Destination = mode === 'windows' ? { mode, queue } : { mode, host: host.trim(), port: Number(port) };
  const changed = !destination || destination.mode !== mode || destinationName(destination) !== destinationName(proposed)
    || enabled !== settings.enabled;
  const queues = [...new Set([...settings.queues, ...(destination?.mode === 'windows' ? [destination.queue] : [])])];
  const validHost = /^(\d{1,3}\.){3}\d{1,3}$/.test(host.trim()) && host.trim().split('.').every(s => Number(s) <= 255)
    && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host.trim());
  const valid = mode === 'windows' ? Boolean(queue) : validHost && /^\d+$/.test(port) && Number(port) > 0 && Number(port) <= 65535;
  const testPending = test && ['pending','reserved','sending','retry'].includes(test.state);
  const testFailure = test?.state === 'retry' || test?.state === 'review';
  const testReason = kitchenFailureMessage(test?.failure_code);
  const act = async (kind: string) => {
    setBusy(kind);
    try {
      if (kind === 'save') {
        await rpc('save_kitchen_printer', { p_destination: proposed, p_enabled: enabled });
        toast.success('Configuração salva.');
      } else if (kind === 'test') {
        await rpc('test_kitchen_printer', { p_id: crypto.randomUUID() });
      } else if (test) {
        const cancelled = await rpc<boolean>('cancel_kitchen_test', { p_id: test.id });
        if (!cancelled) toast.info('O envio já avançou. Confira o papel na cozinha.');
      }
      refresh();
    } catch (e) {
      const message = (e as Error).message;
      toast.error(kind === 'save' ? message : `${message} ${kitchenNetworkHint}`);
    }
    finally { setBusy(''); }
  };
  return <>
    <section className={section}>
      <h2 className="display text-2xl">Destino da comanda</h2>
      <label className="block"><span className="label">Conexão</span>
        <select aria-label="Conexão" className="input" value={mode} onChange={e => setMode(e.target.value as Destination['mode'])}>
          <option value="windows">Fila do Windows</option><option value="tcp">Impressora exclusiva por IP</option>
        </select>
      </label>
      {mode === 'windows' ? <>
        <label className="block"><span className="label">Impressora do computador da cozinha</span>
          <select aria-label="Impressora do computador da cozinha" className="input" value={queue} onChange={e => setQueue(e.target.value)}>
            <option value="">Selecione a fila</option>
            {queues.map(q => <option key={q}>{q}</option>)}
          </select>
        </label>
        <p className={quiet}>{queues.length ? 'Se a Bematech também recebe mesas, escolha a mesma fila utilizada pelo PDV.'
          : 'As filas aparecem quando o agente conecta. A impressora precisa estar instalada para todos os usuários desse computador.'}</p>
      </> : <>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <label><span className="label">Endereço IPv4 da impressora</span>
            <input className="input" value={host} onChange={e => setHost(e.target.value)} placeholder="192.168.1.50" /></label>
          <label><span className="label">Porta TCP</span>
            <input className="input" type="number" min={1} max={65535} value={port} onChange={e => setPort(e.target.value)} /></label>
        </div>
        <p className={quiet}>Use o endereço e a porta de uma impressora dedicada ao delivery.</p>
      </>}
      <label className="flex items-start gap-3 border-t border-ink-4 pt-4">
        <input type="checkbox" className="mt-1 accent-brand" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
        <span><strong>Imprimir automaticamente ao confirmar delivery</strong>
          <span className={'block ' + quiet}>Vale para as próximas confirmações. Comandas já na fila seguem para impressão.</span></span>
      </label>
      <Button loading={busy === 'save'} disabled={!!busy || !valid || !changed} onClick={() => void act('save')}>Salvar configuração</Button>
    </section>
    <section className={section}>
      <h2 className="display text-2xl">Teste no papel</h2>
      <p className={quiet}>Envie uma via identificada como “TESTE - NAO PREPARAR”. O teste pode ser feito antes de ativar os deliveries automáticos.</p>
      {changed && <p className="text-sm text-amber">Salve o destino antes de testar.</p>}
      {!settings.online && <p className="text-sm text-amber">O computador precisa estar conectado para iniciar o teste.
        {!testFailure && ` ${kitchenNetworkHint}`}</p>}
      <Button variant="ghost" leftIcon={<Printer size={16} />} disabled={!!busy || !settings.online || changed || !destination || !!testPending}
        loading={busy === 'test'} onClick={() => void act('test')}>Imprimir comanda de teste</Button>
      {test && <div className="space-y-2 border-t border-ink-4 pt-3" role="status">
        <p className={quiet}>Último teste · {localDate(test.at)}{test.destination && ' · ' + destinationName(test.destination)}</p>
        <p className="text-sm font-semibold">
          {test.state === 'retry' && testReason ? `${testReason} O agente tentará novamente.` : testLabels[test.state] ?? test.state}
        </p>
        {test.state === 'review' && testReason && <p className={quiet}>{testReason}</p>}
        {testFailure && <p className="text-sm text-amber">{kitchenNetworkHint}</p>}
        {['pending','reserved','retry'].includes(test.state) &&
          <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void act('cancel')}>Cancelar teste pendente</Button>}
      </div>}
    </section>
  </>;
}

export function KitchenPrinter() {
  const [access, setAccess] = useState('');
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [checking, setChecking] = useState(false);
  const lock = useCallback(() => { setAccess(''); setPin(''); }, []);
  useEffect(() => {
    if (!access) return;
    const timer = window.setTimeout(lock, 15 * 60_000);
    return () => {
      window.clearTimeout(timer);
      void request('lock_kitchen_settings', { p_access: access }).catch(() => {});
    };
  }, [access,lock]);
  const rpc: Call = useCallback(async <T,>(name: string, args = {}) => {
    try { return await request<T>(name, { ...args, p_access: access }); }
    catch (e) { if (e instanceof AccessExpired) lock(); throw e; }
  }, [access,lock]);
  if (access) return <PrinterSettings rpc={rpc} lock={lock} />;
  return <div className="mx-auto max-w-lg space-y-5">
    <h1 className="display text-4xl">Impressora da cozinha</h1>
    <form className={section} onSubmit={async event => {
      event.preventDefault();
      if (checking) return;
      setChecking(true); setMessage('');
      try {
        const result = await request<{ access?: string; blocked?: boolean }>('unlock_kitchen_settings', { p_pin: pin });
        setPin('');
        if (result.access) setAccess(result.access);
        else setMessage(result.blocked ? 'Muitas tentativas. Aguarde até 10 minutos.' : 'Senha incorreta.');
      } catch (e) { setMessage((e as Error).message); }
      finally { setChecking(false); }
    }}>
      <label className="block"><span className="label">Senha da configuração</span>
        <input autoFocus className="input" type="password" inputMode="numeric" autoComplete="off" maxLength={4}
          value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,''))} /></label>
      {message && <p role="alert" className="text-sm text-amber">{message}</p>}
      <Button type="submit" loading={checking} disabled={pin.length !== 4}>Entrar na configuração</Button>
    </form>
  </div>;
}

function PrinterSettings({ rpc, lock }: { rpc: Call; lock: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [invitation, setInvitation] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const refresh = () => setVersion(v => v + 1);
  useEffect(() => {
    let live = true;
    let timer: number;
    const load = async () => {
      try {
        const snapshot = await rpc<Settings>('kitchen_printer_settings');
        if (live) { setSettings(snapshot); setFailed(false); }
      } catch { if (live) setFailed(true); }
      finally { if (live) timer = window.setTimeout(load, 3000); }
    };
    void load();
    return () => { live = false; clearTimeout(timer); };
  }, [rpc, version]);

  const connection = async (disconnect: boolean) => {
    if (disconnect && !window.confirm('Desconectar este computador e suspender a impressão de novos deliveries?')) return;
    setBusy(true);
    try {
      if (disconnect) {
        await rpc('disconnect_kitchen_computer'); setInvitation(''); refresh();
      } else {
        const code = await rpc<string>('invite_kitchen_computer');
        setInvitation(kitchenPairingCode(code));
      }
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="mx-auto max-w-4xl space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="display text-4xl">Impressora da cozinha</h1>
      <p className={'mt-1 ' + quiet}>Configure onde o restaurante recebe as comandas de delivery.</p></div>
      <Button variant="ghost" size="sm" onClick={lock}>Bloquear painel</Button></header>
    {failed && <p role="alert" className="rounded-lg border border-amber/40 p-3 text-amber">Falha ao consultar a configuração. Tentando novamente…</p>}
    {!settings && !failed && <p className={quiet}>Carregando configuração…</p>}
    {settings && <>
      <section className={section}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="display flex items-center gap-2 text-2xl"><Monitor size={21}/> Computador do restaurante</h2>
          <span className={'text-sm font-semibold ' + (settings.online ? 'text-success' : 'text-amber')}>
            {settings.online ? 'Agente conectado' : settings.paired ? 'Agente sem conexão recente' : 'Aguardando conexão'}
          </span>
        </div>
        {settings.paired && <p className={quiet}>{settings.machine ?? 'Instalação anterior'}{settings.last_seen && ' · Último contato em ' + localDate(settings.last_seen)}</p>}
        <details open={!settings.managed || undefined} className="space-y-3">
          <summary className="cursor-pointer font-semibold">{settings.paired ? 'Conectar outro computador' : 'Instalar e conectar o agente'}</summary>
          <ol className={'list-decimal space-y-1 pl-5 ' + quiet}>
            <li>No Windows 64 bits que fica ligado no restaurante, baixe e extraia o instalador.</li>
            <li>Clique com o botão direito em <strong>Instalar.cmd</strong> e escolha <strong>Executar como administrador</strong>.</li>
            <li>Se o instalador pedir um código, gere-o abaixo e cole na janela. Ao atualizar neste mesmo PC, o agente usa a configuração existente.</li>
          </ol>
          {settings.paired && <p className="text-sm text-amber">Ao usar o código, o novo computador substituirá o atual. Escolha a impressora e reative os deliveries após a troca.</p>}
          <div className="flex flex-wrap gap-2">
            <a className="btn btn-ghost" href={import.meta.env.BASE_URL + 'cozinha-windows-x64.zip'} download><Download size={16}/> Baixar instalador Windows</a>
            <Button variant="ghost" disabled={busy || failed} onClick={() => void connection(false)}>Gerar código de conexão</Button>
          </div>
          {invitation && <label className="block"><span className="label">Código de uso único · válido por 15 minutos</span>
            <input className="input" readOnly value={invitation} onFocus={e => e.target.select()} />
            <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={async () => {
              try { await navigator.clipboard.writeText(invitation); toast.success('Código copiado.'); }
              catch { toast.info('Selecione o código acima e copie.'); }
            }}>Copiar código</Button>
          </label>}
        </details>
        {settings.paired && <Button variant="ghost" size="sm" disabled={busy || failed} onClick={() => void connection(true)}>Desconectar computador</Button>}
      </section>
      {settings.managed && <PrinterForm key={JSON.stringify([settings.machine,settings.destination,settings.enabled])} settings={settings} refresh={refresh} rpc={rpc}/>}
    </>}
  </div>;
}
