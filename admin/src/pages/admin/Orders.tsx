import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Bike, XCircle, MapPin, Store } from 'lucide-react';
import { useOrdersFeed } from '@/contexts/OrdersContext';
import { repository } from '@/services';
import { useToast } from '@/providers/ToastProvider';
import type { Driver, Order, OrderStatus } from '@/types';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatBRL, formatDateTime } from '@/utils/format';
import { nextStatus, ORDER_STATUS_META } from '@/utils/status';
import { cn } from '@/utils/cn';

const FILTERS: { value: OrderStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'received', label: 'Novos' },
  { value: 'confirmed', label: 'Confirmados' },
  { value: 'preparing', label: 'Em preparo' },
  { value: 'ready', label: 'Prontos' },
  { value: 'accepted', label: 'Aceitos' },
  { value: 'at_restaurant', label: 'Na retirada' },
  { value: 'arrived', label: 'No cliente' },
  { value: 'on_the_way', label: 'Saíram' },
  { value: 'delivered', label: 'Entregues' },
  { value: 'cancelled', label: 'Cancelados' },
];

export function AdminOrders() {
  const { orders, loading } = useOrdersFeed();
  const toast = useToast();
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    repository.getDrivers().then(setDrivers);
  }, [orders]);

  const filtered = useMemo(
    () => (filter === 'all' ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter],
  );

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: orders.length };
    orders.forEach((o) => (map[o.status] = (map[o.status] ?? 0) + 1));
    return map;
  }, [orders]);

  const advance = async (order: Order) => {
    const next = nextStatus(order.status, order.fulfillment);
    if (!next) return;
    setBusy(true);
    try {
      await repository.updateOrderStatus(order.id, next);
      toast.success(`${order.code} → ${ORDER_STATUS_META[next].label}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!cancelId) return;
    setBusy(true);
    try {
      await repository.cancelOrder(cancelId, 'Cancelado pela administração');
      toast.success('Pedido cancelado.');
      setCancelId(null);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="display text-3xl text-cream">Pedidos</h1>

      {/* Filtros */}
      <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
              filter === f.value ? 'border-brand bg-brand text-cream' : 'border-ink-4 text-cream-3 hover:border-ink-5',
            )}
          >
            {f.label}
            {counts[f.value] ? (
              <span className={cn('rounded-full px-1.5 text-xs', filter === f.value ? 'bg-cream/20' : 'bg-ink-4')}>
                {counts[f.value]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="mt-5 space-y-3">
        {loading ? (
          <p className="py-10 text-center text-cream-3">Carregando…</p>
        ) : filtered.length === 0 ? (
          <EmptyState emoji="🧾" title="Nenhum pedido" description="Não há pedidos neste filtro." />
        ) : (
          filtered.map((order) => {
            const driver = drivers.find((d) => d.id === order.driverId);
            const isOpen = expanded === order.id;
            const next = nextStatus(order.status, order.fulfillment);
            const terminal = order.status === 'delivered' || order.status === 'cancelled';
            return (
              <div key={order.id} className="card overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : order.id)}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-3 text-lg">
                    {order.fulfillment === 'delivery' ? '🛵' : '🏪'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-cream">{order.code}</span>
                      <OrderStatusBadge status={order.status} />
                    </div>
                    <p className="truncate text-xs text-cream-3">
                      {order.customerName} · {formatDateTime(order.createdAt)}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-bold text-amber">{formatBRL(order.total)}</span>
                  <ChevronRight size={16} className={cn('text-cream-3 transition-transform', isOpen && 'rotate-90')} />
                </button>

                {isOpen && (
                  <div className="border-t border-ink-3 p-4">
                    {/* Itens */}
                    <div className="space-y-1.5 text-sm">
                      {order.items.map((it) => (
                        <div key={it.id} className="flex justify-between">
                          <span className="text-cream">
                            {it.quantity}× {it.product.name}
                            {it.addons.length > 0 && (
                              <span className="block text-xs text-cream-3">
                                {it.addons.map((a) => a.optionName).join(', ')}
                              </span>
                            )}
                            {it.notes && <span className="block text-xs italic text-cream-3">“{it.notes}”</span>}
                          </span>
                          <span className="font-mono text-cream-3">{formatBRL(it.unitPrice * it.quantity)}</span>
                        </div>
                      ))}
                    </div>

                    {/* Info entrega/pagamento */}
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-3 pt-3 text-xs text-cream-3">
                      <PaymentStatusBadge status={order.paymentStatus} />
                      <span className="rounded-full bg-ink-3 px-2 py-1 uppercase">{order.paymentMethod}</span>
                      {order.fulfillment === 'delivery' ? (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} /> {order.address?.street}, {order.address?.number} — {order.address?.neighborhood}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Store size={12} /> Retirada no local
                        </span>
                      )}
                    </div>

                    {/* Entregador */}
                    {order.fulfillment === 'delivery' && (
                      <div className="mt-2 flex items-center justify-between rounded-lg bg-ink-3/50 px-3 py-2 text-xs">
                        <span className="flex items-center gap-1.5 text-cream-3">
                          <Bike size={13} />
                          {driver ? `${driver.model} · ${driver.plate}` : 'Sem entregador'}
                        </span>
                      </div>
                    )}

                    {/* Ações */}
                    {!terminal && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={<XCircle size={15} />}
                          onClick={() => setCancelId(order.id)}
                        >
                          Cancelar
                        </Button>
                        {next && (
                          <Button size="sm" fullWidth loading={busy} onClick={() => advance(order)}>
                            {next === 'confirmed' ? 'Confirmar pedido' : ORDER_STATUS_META[next].label}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <ConfirmDialog
        open={cancelId !== null}
        onClose={() => setCancelId(null)}
        onConfirm={cancel}
        title="Cancelar pedido"
        message="Tem certeza que deseja cancelar este pedido? Esta ação avisa o cliente."
        confirmLabel="Cancelar pedido"
        danger
        loading={busy}
      />
    </div>
  );
}
