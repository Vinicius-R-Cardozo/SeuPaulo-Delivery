import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { repository } from '@/services';
import type { Order } from '@/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListRowSkeleton } from '@/components/ui/Skeleton';
import { formatBRL, formatDateTime, formatKm } from '@/utils/format';
import { haversineKm } from '@/utils/geo';
import { RESTAURANT } from '@/data/restaurant';

export function DriverHistory() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    repository.getOrdersByDriver(profile.id).then((list) => {
      setOrders(list.filter((o) => o.status === 'delivered'));
      setLoading(false);
    });
  }, [profile]);

  return (
    <div className="px-4 pt-4">
      <h1 className="display mb-4 text-2xl text-cream">Histórico de entregas</h1>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <ListRowSkeleton key={i} />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState emoji="📦" title="Nenhuma entrega ainda" description="Suas entregas concluídas aparecem aqui." />
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const km = o.address
              ? haversineKm(RESTAURANT.location, { lat: o.address.lat, lng: o.address.lng })
              : 0;
            return (
              <div key={o.id} className="card flex items-center gap-3 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15 text-success">
                  <Package size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-semibold text-cream">{o.code}</p>
                  <p className="text-xs text-cream-3">
                    {formatDateTime(o.createdAt)} · {formatKm(km)}
                  </p>
                </div>
                <span className="font-mono text-sm font-bold text-amber">
                  {formatBRL(o.deliveryFee)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
