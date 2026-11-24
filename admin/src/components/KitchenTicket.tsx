import { useEffect, useState } from 'react';
import { getSupabase } from '@/services/supabase/client';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/providers/ToastProvider';

const labels = {
  pending: 'Na fila da cozinha',
  reserved: 'Preparando envio',
  sending: 'Enviando à impressora',
  sent: 'Enviada à impressora',
  review: 'Confira na cozinha se a comanda saiu',
  retry: 'Impressora indisponível. Nova tentativa automática.',
  cancelled: 'Envio cancelado',
};
type Ticket = { id: string; copy: number; state: keyof typeof labels };

export function KitchenTicket({ orderId, closed }: { orderId: string; closed: boolean }) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const toast = useToast();

  useEffect(() => {
    let active = true;
    let timer: number;
    const refresh = async () => {
      try {
        const { data, error } = await getSupabase().rpc('kitchen_ticket_status', { p_order: orderId });
        if (!active) return;
        setFailed(Boolean(error));
        if (!error) setTicket(data);
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) timer = window.setTimeout(refresh, 3000);
      }
    };
    void refresh();
    return () => { active = false; window.clearTimeout(timer); };
  }, [orderId, revision]);

  const reprint = async () => {
    if (!ticket || saving || !window.confirm('Conferiu o papel na cozinha? Emitir uma via marcada como reimpressão?')) return;
    setSaving(true);
    try {
      const { data, error } = await getSupabase().rpc('reprint_kitchen_ticket', { p_order: orderId, p_job: ticket.id });
      if (error) throw error;
      if (data) toast.success('Segunda via solicitada.');
      else toast.info('A situação da comanda mudou. Confira o estado atual.');
    } catch {
      toast.error('Falha ao solicitar segunda via. Confira a fila antes de tentar novamente.');
    } finally {
      setSaving(false);
      setRevision(value => value + 1);
    }
  };

  if (!ticket && !failed) return null;
  return <section className="space-y-2 border-t border-ink-4 pt-3">
    <h3 className="font-semibold">Comanda da cozinha</h3>
    <p role="status" className="text-xs text-cream-3">
      {failed ? 'Não foi possível consultar a fila da cozinha.' :
        ticket && <>{ticket.copy > 0 && `Reimpressão ${ticket.copy} · `}{labels[ticket.state]}</>}
    </p>
    {!failed && !closed && ticket && ['sent','review'].includes(ticket.state) &&
      <Button variant="ghost" size="sm" loading={saving} onClick={reprint}>Reimprimir comanda</Button>}
  </section>;
}
