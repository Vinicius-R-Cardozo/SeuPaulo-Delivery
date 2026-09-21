import { useNavigate } from 'react-router-dom';
import { RefreshCw, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCustomerOrders } from '@/hooks/useOrders';
import { useCart } from '@/contexts/CartContext';
import { useToast } from '@/providers/ToastProvider';
import { OrderStatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListRowSkeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { formatBRL, formatDateTime } from '@/utils/format';
import type { Order } from '@/types';

export function Orders() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { orders, loading } = useCustomerOrders(profile?.id);
  const { addItem } = useCart();
  const toast = useToast();

  const reorder = (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    order.items.forEach((item) =>
      addItem({
        product: item.product,
        quantity: item.quantity,
        addons: item.addons,
        notes: item.notes,
      }),
    );
    toast.success('Itens adicionados ao carrinho 🛒');
    navigate('/app/carrinho');
  };

  const concluido = (s: Order['status']) => s === 'delivered' || s === 'cancelled';
  const emAndamento = orders.filter((o) => !concluido(o.status));
  const concluidos = orders.filter((o) => concluido(o.status));

  const renderCard = (order: Order) => (
    <button
      key={order.id}
      onClick={() => navigate(`/app/pedido/${order.id}`)}
      className="card w-full p-4 text-left transition-colors hover:border-ink-5"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-semibold text-cream">{order.code}</span>
        <OrderStatusBadge status={order.status} />
      </div>
      <p className="mt-1 text-xs text-cream-3">{formatDateTime(order.createdAt)}</p>
      <p className="mt-2 line-clamp-1 text-sm text-cream-3">
        {order.items.map((i) => `${i.quantity}× ${i.product.name}`).join(', ')}
      </p>
      <div className="mt-3 flex items-center justify-between">
        <span className="font-mono text-sm font-semibold text-amber">{formatBRL(order.total)}</span>
        <div className="flex items-center gap-3">
          {concluido(order.status) && (
            <span
              onClick={(e) => reorder(order, e)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-2 hover:underline"
            >
              <RefreshCw size={13} /> Pedir novamente
            </span>
          )}
          <ChevronRight size={16} className="text-cream-3" />
        </div>
      </div>
    </button>
  );

  return (
    <div className="px-4 pt-4">
      <h1 className="display mb-4 text-2xl text-cream">Meus pedidos</h1>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <ListRowSkeleton key={i} />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          emoji="🧾"
          title="Nenhum pedido ainda"
          description="Seus pedidos aparecem aqui."
          action={<Button onClick={() => navigate('/app/cardapio')}>Ver cardápio</Button>}
        />
      ) : (
        <div className="space-y-7">
          {emAndamento.length > 0 && (
            <section>
              <h2 className="eyebrow mb-2 flex items-center gap-2 text-cream-3">
                <span className="h-2 w-2 rounded-full bg-brand-2" /> Em andamento
              </h2>
              <div className="space-y-3">{emAndamento.map(renderCard)}</div>
            </section>
          )}
          {concluidos.length > 0 && (
            <section>
              <h2 className="eyebrow mb-2 flex items-center gap-2 text-cream-3">
                <span className="h-2 w-2 rounded-full bg-ink-5" /> Concluídos
              </h2>
              <div className="space-y-3">{concluidos.map(renderCard)}</div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
