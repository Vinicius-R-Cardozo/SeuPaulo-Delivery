import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { getSupabase } from '@/services/supabase/client';

type DocumentKind = 'terms' | 'privacy';
type Publication = { revision: number; body: string; published_at: string };

const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const MAX_LENGTH = 60_000;
const MAX_SUMMARY_LENGTH = 2_000;

async function getLatest(kind: DocumentKind, signal?: AbortSignal) {
  const query = getSupabase().from('legal_documents').select('revision,body,published_at')
    .eq('kind', kind).order('revision', { ascending: false }).limit(1);
  if (signal) query.abortSignal(signal);
  const { data, error } = await query.maybeSingle<Publication>();
  if (error) throw error;
  return data;
}

function DocumentEditor({ kind, title }: { kind: DocumentKind; title: string }) {
  const editorId = useId();
  const [latest, setLatest] = useState<Publication | null>(null);
  const [body, setBody] = useState('');
  const [summary, setSummary] = useState('');
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    getLatest(kind, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      setLatest(data);
      setBody(data?.body ?? '');
      setReady(true);
    }).catch(() => {
      if (!controller.signal.aborted) setError('Não foi possível carregar a versão publicada.');
    });
    return () => controller.abort();
  }, [kind, attempt]);

  const nextRevision = (latest?.revision ?? 0) + 1;
  const text = body.trim();
  const summaryText = summary.trim();
  const changed = text !== (latest?.body ?? '');
  const valid = text.length > 0 && text.length <= MAX_LENGTH &&
    (nextRevision === 1 || (summaryText.length > 0 && summaryText.length <= MAX_SUMMARY_LENGTH));

  const publish = async () => {
    if (!ready || !changed || !valid || saving || conflict) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { data, error: publishError } = await getSupabase().from('legal_documents')
        .insert({ kind, revision: nextRevision, body: text, change_summary: summaryText || null })
        .select('revision,body,published_at').single<Publication>();
      if (publishError) {
        if (publishError.code === '23505') setConflict(true);
        else setError('Não foi possível publicar. Seu texto continua no editor.');
        return;
      }
      setLatest(data);
      setBody(data.body);
      setSummary('');
      setNotice(`Versão ${data.revision} publicada.`);
    } catch {
      setError('Não foi possível publicar. Seu texto continua no editor.');
    } finally {
      setConfirm(false);
      setSaving(false);
    }
  };

  const refreshAfterConflict = async () => {
    setError('');
    try {
      const current = await getLatest(kind);
      setLatest(current);
      setConflict(false);
      setNotice('Versão publicada atualizada abaixo. Compare com o seu texto e revise o resumo antes de publicar.');
    } catch {
      setError('Não foi possível carregar a nova versão. Tente novamente.');
    }
  };

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="display text-xl text-cream">{title}</h2>
        <p className="mt-1 text-sm text-cream-3">{latest
          ? `Versão ${latest.revision} · Publicada em ${dateFormat.format(new Date(latest.published_at))}`
          : ready ? 'Nenhuma versão publicada' : error ? 'Versão indisponível' : 'Carregando versão…'}</p>
      </div>
      <div className="space-y-2">
        <label htmlFor={editorId} className="block text-sm font-medium text-cream">Texto de {title}</label>
        <textarea id={editorId} rows={12} value={body} disabled={!ready || saving} maxLength={MAX_LENGTH}
          onChange={(event) => { setBody(event.target.value); setNotice(''); }}
          className="w-full rounded-xl border border-ink-4 bg-ink p-4 text-sm leading-relaxed text-cream focus:border-brand focus:outline-none disabled:opacity-60"
          placeholder="Cole o texto revisado, com uma linha em branco entre os parágrafos." />
      </div>
      {nextRevision > 1 && (
        <div className="space-y-2">
          <label htmlFor={`${editorId}-summary`} className="block text-sm font-medium text-cream">O que mudou</label>
          <p id={`${editorId}-summary-help`} className="text-sm text-cream-3">Destaque as mudanças que clientes e entregadores precisam saber. O resumo aparece antes da confirmação no app.</p>
          <textarea id={`${editorId}-summary`} aria-describedby={`${editorId}-summary-help`} required rows={4}
            value={summary} disabled={!ready || saving} maxLength={MAX_SUMMARY_LENGTH}
            onChange={event => { setSummary(event.target.value); setNotice(''); }}
            className="w-full rounded-xl border border-ink-4 bg-ink p-4 text-sm leading-relaxed text-cream focus:border-brand focus:outline-none disabled:opacity-60"
            placeholder="Detalhamos por quanto tempo guardamos o histórico de pedidos." />
        </div>
      )}
      {latest && changed && (
        <details className="rounded-xl border border-ink-4 p-3 text-sm text-cream-3">
          <summary className="cursor-pointer font-medium text-cream">Ver o texto publicado</summary>
          <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words">{latest.body}</p>
        </details>
      )}
      {notice && <p role="status" className="text-sm text-cream">{notice}</p>}
      {error && <p role="alert" className="text-sm text-brand-2">{error}</p>}
      {conflict && (
        <div className="space-y-2 text-sm text-cream-3" role="status">
          <p>Uma nova versão foi publicada enquanto você editava. Seu texto está no editor.</p>
          <Button variant="ghost" onClick={() => void refreshAfterConflict()}>Carregar versão publicada</Button>
        </div>
      )}
      {!ready && error && <Button variant="ghost" onClick={() => {
        setError('');
        setAttempt(value => value + 1);
      }}>Tentar novamente</Button>}
      <Button disabled={!ready || !changed || !valid || conflict || saving} onClick={() => setConfirm(true)}>
        Publicar versão {nextRevision}
      </Button>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={publish}
        title={`Publicar ${title}?`} loading={saving} confirmLabel="Publicar"
        message={`A versão ${nextRevision} será exibida no app e exigirá uma nova confirmação de clientes e entregadores. Confira se o texto está completo e descreve os fluxos em produção.`} />
    </section>
  );
}

export function LegalDocuments() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="display text-3xl text-cream">Documentos legais</h1>
        <p className="mt-2 text-sm text-cream-3">Ao publicar, o texto fica disponível para clientes e entregadores no app.</p>
      </header>
      <DocumentEditor kind="terms" title="Termos de Uso" />
      <DocumentEditor kind="privacy" title="Política de Privacidade" />
    </div>
  );
}
