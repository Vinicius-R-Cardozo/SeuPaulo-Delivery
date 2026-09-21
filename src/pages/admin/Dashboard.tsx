import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, DollarSign, Bike, Users, ArrowRight } from 'lucide-react';
import { useAllOrders } from '@/hooks/useOrders';
import { OrderStatusBadge } from '@/components/ui/StatusBadge';
import { formatBRL, formatTime } from '@/utils/format';
import type { Order } from '@/types';

export function Dashboard() {
  const { orders, loading } = useAllOrders();
  const navigate = useNavigate();

  const stats = useMemo(() => computeStats(orders), [orders]);

  return (
    <div>
      <h1 className="display text-3xl text-cream">Dashboard</h1>
      <p className="mt-1 text-sm text-cream-3">Visão geral do Seu Paulo Buteco hoje.</p>

      {/* KPIs */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<Package size={20} />} label="Pedidos hoje" value={String(stats.todayCount)} accent="brand" />
        <Kpi
          icon={<DollarSign size={20} />}
          label="Faturamento hoje"
          value={formatBRL(stats.todayRevenue)}
          accent="amber"
        />
        <Kpi icon={<Bike size={20} />} label="Entregas em andamento" value={String(stats.inDelivery)} accent="info" />
        <Kpi icon={<Users size={20} />} label="Clientes" value={String(stats.customers)} accent="success" />
      </div>

      {/* Gráfico + pedidos recentes */}
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-3">
          <h2 className="display text-lg text-cream">Faturamento — últimos 7 dias</h2>
          <RevenueChart data={stats.last7Days} />
        </div>

        <div className="card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="display text-lg text-cream">Pedidos recentes</h2>
            <button
              onClick={() => navigate('/admin/pedidos')}
              className="flex items-center gap-1 text-sm font-semibold text-brand-2"
            >
              Ver todos <ArrowRight size={14} />
            </button>
          </div>
          {loading ? (
            <p className="py-8 text-center text-sm text-cream-3">Carregando…</p>
          ) : orders.length === 0 ? (
            <p className="py-8 text-center text-sm text-cream-3">Nenhum pedido ainda.</p>
          ) : (
            <div className="space-y-2">
              {orders.slice(0, 6).map((o) => (
                <button
                  key={o.id}
                  onClick={() => navigate('/admin/pedidos')}
                  className="flex w-full items-center justify-between rounded-lg border border-ink-3 px-3 py-2.5 text-left transition-colors hover:border-ink-5"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-cream">{o.code}</p>
                    <p className="truncate text-xs text-cream-3">
                      {o.customerName} · {formatTime(o.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-amber">{formatBRL(o.total)}</span>
                    <OrderStatusBadge status={o.status} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function computeStats(orders: Order[]) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();

  const valid = orders.filter((o) => o.status !== 'cancelled');
  const today = valid.filter((o) => new Date(o.createdAt).getTime() >= todayMs);

  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (6 - i));
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    const revenue = valid
      .filter((o) => {
        const t = new Date(o.createdAt).getTime();
        return t >= day.getTime() && t < next.getTime();
      })
      .reduce((s, o) => s + o.total, 0);
    return { label: day.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''), revenue };
  });

  return {
    todayCount: today.length,
    todayRevenue: today.reduce((s, o) => s + o.total, 0),
    inDelivery: orders.filter((o) => o.status === 'on_the_way').length,
    customers: new Set(orders.map((o) => o.customerId)).size,
    last7Days,
  };
}

function RevenueChart({ data }: { data: { label: string; revenue: number }[] }) {
  const max = Math.max(...data.map((d) => d.revenue), 1);
  return (
    <div className="mt-6 flex h-48 items-end justify-between gap-2">
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-2">
          <span className="text-[10px] font-mono text-cream-3">
            {d.revenue > 0 ? formatBRL(d.revenue).replace('R$', '').trim() : ''}
          </span>
          <div
            className="w-full rounded-t-md bg-gradient-to-t from-brand-deep to-brand-2 transition-all"
            style={{ height: `${Math.max(4, (d.revenue / max) * 150)}px` }}
            title={formatBRL(d.revenue)}
          />
          <span className="text-[11px] capitalize text-cream-3">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: 'brand' | 'amber' | 'info' | 'success';
}) {
  const colors = {
    brand: 'bg-brand/15 text-brand-2',
    amber: 'bg-amber/15 text-amber',
    info: 'bg-info/15 text-info',
    success: 'bg-success/15 text-success',
  }[accent];
  return (
    <div className="card p-5">
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${colors}`}>{icon}</span>
      <p className="mt-3 font-mono text-2xl font-bold text-cream">{value}</p>
      <p className="text-sm text-cream-3">{label}</p>
    </div>
  );
}
