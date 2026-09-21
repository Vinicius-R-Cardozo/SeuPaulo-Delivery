import { useEffect, useMemo, useState } from 'react';
import { Wallet, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { repository } from '@/services';
import type { Order } from '@/types';
import { FullScreenLoader } from '@/components/ui/Spinner';
import { formatBRL } from '@/utils/format';
import { cn } from '@/utils/cn';

type Range = 'today' | 'week' | 'month';

const RANGES: { value: Range; label: string; days: number }[] = [
  { value: 'today', label: 'Hoje', days: 1 },
  { value: 'week', label: 'Semana', days: 7 },
  { value: 'month', label: 'Mês', days: 30 },
];

export function DriverEarnings() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>('week');

  useEffect(() => {
    if (!profile) return;
    repository.getOrdersByDriver(profile.id).then((list) => {
      setOrders(list.filter((o) => o.status === 'delivered'));
      setLoading(false);
    });
  }, [profile]);

  const filtered = useMemo(() => {
    const days = RANGES.find((r) => r.value === range)!.days;
    const since = Date.now() - days * 86400000;
    return orders.filter((o) => new Date(o.createdAt).getTime() >= since);
  }, [orders, range]);

  const total = filtered.reduce((s, o) => s + o.deliveryFee, 0);

  if (loading) return <FullScreenLoader />;

  return (
    <div className="px-4 pt-4">
      <h1 className="display mb-4 text-2xl text-cream">Meus ganhos</h1>

      {/* Seletor de período */}
      <div className="mb-4 flex gap-2 rounded-xl border border-ink-3 bg-ink-2 p-1">
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className={cn(
              'flex-1 rounded-lg py-2 text-sm font-medium transition-colors',
              range === r.value ? 'bg-amber text-ink' : 'text-cream-3',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Card total */}
      <div className="card mb-5 p-6 text-center">
        <span className="flex justify-center text-amber">
          <Wallet size={28} />
        </span>
        <p className="mt-3 font-mono text-4xl font-bold text-cream">{formatBRL(total)}</p>
        <p className="mt-1 flex items-center justify-center gap-1 text-sm text-cream-3">
          <TrendingUp size={14} className="text-success" />
          {filtered.length} {filtered.length === 1 ? 'entrega' : 'entregas'} no período
        </p>
      </div>

      {/* Detalhamento */}
      <h2 className="display mb-2 text-base text-cream">Detalhamento</h2>
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-cream-3">Nenhuma entrega neste período.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-lg border border-ink-3 bg-ink-2 px-4 py-3">
              <div>
                <p className="font-mono text-sm text-cream">{o.code}</p>
                <p className="text-xs text-cream-3">
                  {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <span className="font-mono text-sm font-semibold text-amber">
                {formatBRL(o.deliveryFee)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
