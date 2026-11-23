import { useEffect, useMemo, useState } from 'react';
import { Bike, Clock3, MapPin, Search, Store } from 'lucide-react';
import { useOrdersFeed } from '@/contexts/OrdersContext';
import { repository } from '@/services';
import { useToast } from '@/providers/ToastProvider';
import type { Driver, Order, OrderStatus, Profile } from '@/types';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PaymentStatusBadge } from '@/components/ui/StatusBadge';
import { formatBRL, formatDateTime } from '@/utils/format';
import { nextStatus, ORDER_STATUS_META } from '@/utils/status';
import { cn } from '@/utils/cn';

const columns: { key: string; label: string; tint: string; statuses: OrderStatus[] }[] = [
  { key: 'new', label: 'Novos', tint: 'border-t-brand-2', statuses: ['received'] },
  { key: 'store', label: 'Na loja', tint: 'border-t-amber', statuses: ['confirmed','preparing','ready','accepted','at_restaurant'] },
  { key: 'road', label: 'Em entrega', tint: 'border-t-success', statuses: ['on_the_way','arrived'] },
];
const terminal = (order: Order) => order.status === 'delivered' || order.status === 'cancelled';
const labels: Partial<Record<OrderStatus, string>> = {
  confirmed: 'Confirmar pedido', preparing: 'Iniciar preparo', ready: 'Marcar como pronto', delivered: 'Confirmar retirada',
};
const payment = { pix: 'Pix', cash: 'Dinheiro', card: 'Cartão' };

function statusText(order: Order) {
  if (order.fulfillment === 'pickup' && order.status === 'ready') return 'Pronto para retirada';
  if (order.fulfillment === 'pickup' && order.status === 'delivered') return 'Retirado';
  if (order.fulfillment === 'delivery' && !order.driverId && ['confirmed','preparing','ready'].includes(order.status))
    return 'Aguardando entregador';
  if (order.status === 'arrived') return 'No cliente · aguardando código';
  return ORDER_STATUS_META[order.status].label;
}

export function AdminOrders() {
  const { orders, loading } = useOrdersFeed();
  const toast = useToast();
  const [history, setHistory] = useState(false);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Pick<Order, 'id' | 'code'> | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [courier, setCourier] = useState<{id: string; driver: Driver | null; profile: Profile | null} | null>(null);
  const newCount = orders.filter(order => order.status === 'received').length;
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR').replace(/^#/, '');
    return orders.filter(order => terminal(order) === history && (!type || order.fulfillment === type) &&
      (!query || [order.code, order.customerName].some(value => value.toLocaleLowerCase('pt-BR').includes(query))));
  }, [orders, history, search, type]);
  const selected = filtered.find(order => order.id === selectedId) ?? filtered[0];
  const driverId = selected?.driverId;
  useEffect(() => {
    if (!driverId) return;
    let active = true;
    void Promise.all([repository.getDriver(driverId), repository.getProfileById(driverId)])
      .then(([driver, profile]) => { if (active) setCourier({ id: driverId, driver, profile }); })
      .catch(() => {});
    return () => { active = false; };
  }, [driverId]);

  const groups = history ? [{ key:'history', label:'Finalizados', tint:'border-t-ink-5', orders:filtered }]
    : columns.map(column => ({ ...column, orders:filtered.filter(order => column.statuses.includes(order.status)) }));

  const advance = async (order: Order) => {
    const next = nextStatus(order.status, order.fulfillment);
    if (!next || busy) return;
    setBusy(order.id);
    try {
      await repository.updateOrderStatus(order.id, next);
      setSelectedId(order.id);
      if (next === 'delivered') setHistory(true);
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(null); }
  };

  const requestCancellation = (order: Order) => {
    setCancelTarget({ id: order.id, code: order.code });
    setCancelReason('');
  };

  const cancel = async () => {
    const reason = cancelReason.trim();
    if (!cancelTarget || !reason || busy) return;
    setBusy(cancelTarget.id);
    try {
      await repository.cancelOrder(cancelTarget.id, reason);
      setSelectedId(cancelTarget.id);
      setHistory(true);
      setCancelTarget(null);
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-4xl text-cream">Pedidos</h1>
          <p className="mt-1 text-sm text-cream-3">Acompanhe o turno e confirme os pedidos que chegaram.</p>
        </div>
        <div role="status" className={cn('rounded-xl border px-3.5 py-2.5 text-sm font-semibold',
          newCount ? 'border-brand/50 bg-brand/15 text-cream' : 'border-ink-4 text-cream-3')}>
          <span aria-hidden className={cn('mr-2 inline-block h-2 w-2 rounded-full',newCount ? 'bg-brand-2' : 'bg-ink-5')} />
          {newCount} aguardando confirmação
        </div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div aria-label="Visualização de pedidos" className="flex gap-1 rounded-lg border border-ink-4 bg-ink-2 p-1">
          {[false,true].map(value => (
            <button key={String(value)} type="button" aria-pressed={history === value}
              onClick={() => { setHistory(value); setSelectedId(null); }}
              className={cn('rounded-md px-3 py-2 text-sm font-medium',history === value ? 'bg-ink-4 text-cream' : 'text-cream-3')}>
              {value ? 'Histórico' : 'Em andamento'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="relative">
            <Search size={15} aria-hidden className="absolute left-3 top-3 text-cream-3" />
            <input type="search" aria-label="Buscar código ou cliente" placeholder="Buscar código ou cliente"
              className="rounded-lg border border-ink-4 bg-ink-2 py-2.5 pl-9 pr-3 text-sm"
              value={search} onChange={e => setSearch(e.target.value)} />
          </label>
          <select value={type} onChange={e => setType(e.target.value)} aria-label="Tipo de pedido"
            className="rounded-lg border border-ink-4 bg-ink-2 px-3 py-2.5 text-sm">
            <option value="">Todos os tipos</option><option value="delivery">Entrega</option><option value="pickup">Retirada</option>
          </select>
        </div>
      </div>
      {loading ? <p className="py-10 text-center text-cream-3">Carregando pedidos…</p> : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className={cn('grid items-start gap-3',!history && 'md:grid-cols-3')}>
            {groups.map(group => (
              <section key={group.key} className={cn('min-w-0 overflow-hidden rounded-xl border border-ink-4 border-t-3 bg-ink-2/70 md:min-h-[28rem]',group.tint)}>
                <header className="flex items-center justify-between gap-2 border-b border-ink-4 px-3.5 py-3.5">
                  <h2 className="text-sm font-bold">{group.label}</h2><span className="rounded bg-ink-4 px-1.5 py-0.5 text-xs">{group.orders.length}</span>
                </header>
                <div className="grid gap-2.5 p-2.5">
                  {group.orders.length === 0 && <p className="p-2 text-xs text-cream-3">Nenhum pedido nesta etapa.</p>}
                  {group.orders.map(order => {
                    const next = nextStatus(order.status, order.fulfillment);
                    return (
                      <article key={order.id} className={cn('rounded-lg border p-3',
                        selected?.id === order.id ? 'border-brand-2/75 bg-brand/10' : 'border-ink-4 bg-ink-2')}>
                        <button type="button" aria-pressed={selected?.id === order.id} onClick={() => setSelectedId(order.id)}
                          className="block w-full space-y-2 text-left">
                          <span className="flex flex-wrap items-baseline justify-between gap-1"><strong>{order.code}</strong>
                            <span className="text-[11px] text-cream-3">{formatDateTime(order.createdAt)}</span></span>
                          <span className="block"><strong className="block break-words text-sm">{order.customerName}</strong>
                            <span className="line-clamp-2 text-xs text-cream-3">{order.items.map(item => item.product.name).join(' · ')}</span></span>
                          <span className="flex flex-wrap items-center justify-between gap-1 text-xs">
                            <span className="rounded border border-ink-5 px-1.5 py-0.5 text-cream-3">{order.fulfillment === 'delivery' ? 'Entrega' : 'Retirada'}</span>
                            <strong>{formatBRL(order.total)}</strong></span>
                          <span className={cn('block text-xs font-medium',group.key === 'road' ? 'text-success' : 'text-amber')}>{statusText(order)}</span>
                        </button>
                        {next && <Button size="sm" fullWidth className="mt-3" variant={order.status === 'received' ? 'primary' : 'ghost'}
                          disabled={busy !== null && busy !== order.id} loading={busy === order.id} onClick={() => void advance(order)}>
                          {labels[next] ?? ORDER_STATUS_META[next].label}
                        </Button>}
                        {order.status === 'confirmed' && (
                          <Button variant="ghost" size="sm" fullWidth className="mt-2" disabled={busy !== null}
                            onClick={() => requestCancellation(order)}>Cancelar pedido</Button>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          {selected && <OrderDetails key={selected.id} order={selected} courier={courier?.id === driverId ? courier : null}
            busy={busy} advance={advance} cancel={() => requestCancellation(selected)} />}
        </div>
      )}
      <Modal
        open={cancelTarget !== null}
        onClose={() => { if (!busy) setCancelTarget(null); }}
        title={`Cancelar pedido ${cancelTarget?.code ?? ''}`}
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" fullWidth disabled={busy !== null} onClick={() => setCancelTarget(null)}>
              Não
            </Button>
            <Button variant="danger" fullWidth loading={busy !== null} disabled={!cancelReason.trim()} onClick={cancel}>
              Sim, cancelar
            </Button>
          </div>
        }
      >
        <p className="text-sm text-cream-3">Deseja cancelar este pedido? O cliente receberá o motivo no app.</p>
        <label className="mt-4 block">
          <span className="label">Motivo do cancelamento</span>
          <textarea className="input min-h-20 resize-y" value={cancelReason} maxLength={240} disabled={busy !== null}
            onChange={event => setCancelReason(event.target.value)} placeholder="Ex.: O prato escolhido acabou." />
        </label>
      </Modal>
    </div>
  );
}

function OrderDetails({ order, courier, busy, advance, cancel }: {
  order: Order; courier: {driver: Driver | null; profile: Profile | null} | null;
  busy: string | null; advance: (order: Order) => Promise<void>; cancel: () => void;
}) {
  const next = nextStatus(order.status, order.fulfillment);
  const address = order.address;
  const delivery = order.fulfillment === 'delivery';
  return (
    <aside aria-label="Detalhes do pedido" className="min-w-0 overflow-hidden rounded-xl border border-ink-4 bg-ink-2 xl:sticky xl:top-4">
      <header className="border-b border-ink-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="display text-2xl">Pedido {order.code}</h2>
          <span className="rounded border border-ink-5 px-1.5 py-1 text-xs">{delivery ? 'Entrega' : 'Retirada'}</span>
        </div>
        <p className="mt-1 text-sm text-cream-3">{order.customerName} · {formatDateTime(order.createdAt)}</p>
        <p className="mt-2 text-xs font-semibold text-amber">{statusText(order)}</p>
      </header>
      <div className="space-y-4 p-4 text-sm">
        <section>
          <h3 className="mb-2 font-semibold">Itens do pedido</h3>
          <ul className="space-y-2">
            {order.items.map(item => <li key={item.id} className="flex justify-between gap-3 text-xs">
              <span>{item.quantity} × {item.product.name}
                {item.addons.length > 0 && <span className="block text-cream-3">{item.addons.map(addon => addon.optionName).join(', ')}</span>}
                {item.notes && <span className="block italic text-cream-3">“{item.notes}”</span>}
              </span>
              <span className="shrink-0">{formatBRL(item.unitPrice * item.quantity)}</span>
            </li>)}
          </ul>
          {delivery && <p className="mt-2 flex justify-between text-xs text-cream-3"><span>Taxa de entrega</span><span>{formatBRL(order.deliveryFee)}</span></p>}
          {order.discount > 0 && <p className="mt-2 flex justify-between text-xs text-cream-3"><span>Desconto</span><span>−{formatBRL(order.discount)}</span></p>}
          <p className="mt-3 flex justify-between border-t border-ink-4 pt-2 font-semibold"><span>Total</span><span>{formatBRL(order.total)}</span></p>
        </section>
        <section className="border-t border-ink-4 pt-3">
          <h3 className="mb-2 flex items-center gap-1.5 font-semibold">{delivery ? <MapPin size={14} /> : <Store size={14} />}
            {delivery ? 'Endereço de entrega' : 'Retirada no balcão'}</h3>
          {address && <p className="break-words text-xs text-cream-3">
            {address.street}, {address.number} · {address.neighborhood}{address.complement && <span className="block">{address.complement}</span>}
          </p>}
          {delivery && <p className="mt-2 flex items-start gap-1.5 text-xs text-cream-3"><Bike size={14} className="shrink-0" />
            {courier?.profile?.fullName ?? (order.driverId ? 'Entregador atribuído' : 'Sem entregador')}
            {courier?.driver && (' · ' + courier.driver.model)}
          </p>}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-cream-3">
            <PaymentStatusBadge status={order.paymentStatus} /><span>{payment[order.paymentMethod]}</span>
            {order.changeFor != null && <span>Troco para {formatBRL(order.changeFor)}</span>}
          </div>
        </section>
        {order.statusHistory.length > 0 && <section className="border-t border-ink-4 pt-3">
          <h3 className="mb-2 flex items-center gap-1.5 font-semibold"><Clock3 size={14} /> Acompanhamento</h3>
          <ol className="space-y-2 border-l border-ink-5 pl-3 text-xs text-cream-3">
            {order.statusHistory.map((event,index) => <li key={event.at + index}>
              {formatDateTime(event.at)} · {ORDER_STATUS_META[event.status].label}
              {event.note && <span className="block">{event.note}</span>}
            </li>)}
          </ol>
        </section>}
      </div>
      {!terminal(order) && <footer className="space-y-2 border-t border-ink-4 p-4">
        {next ? <Button fullWidth size="sm" loading={busy === order.id} disabled={busy !== null && busy !== order.id}
          onClick={() => void advance(order)}>{labels[next] ?? ORDER_STATUS_META[next].label}</Button>
          : delivery && <p className="text-xs text-cream-3">As etapas da entrega são atualizadas pelo entregador.</p>}
        <Button variant="ghost" fullWidth size="sm" disabled={busy !== null} onClick={cancel}>Cancelar pedido</Button>
      </footer>}
    </aside>
  );
}
