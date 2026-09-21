import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Power, Package, Wallet, MapPin, Navigation, Clock, CircleCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDriver } from '@/hooks/useDriver';
import { repository } from '@/services';
import type { Order } from '@/types';
import { Button } from '@/components/ui/Button';
import { FullScreenLoader } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { DriverStatusBadge } from '@/components/ui/StatusBadge';
import { OrderStatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/providers/ToastProvider';
import { formatBRL, formatKm } from '@/utils/format';
import { haversineKm } from '@/utils/geo';
import { RESTAURANT } from '@/data/restaurant';
import { cn } from '@/utils/cn';

export function DriverHome() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { driver, loading, refresh } = useDriver();

  const [available, setAvailable] = useState<Order[]>([]);
  const [myActive, setMyActive] = useState<Order[]>([]);
  const [accepting, setAccepting] = useState<string | null>(null);

  useEffect(() => {
    if (!driver || driver.status !== 'approved' || !driver.online) {
      setAvailable([]);
      return;
    }
    const unsub = repository.subscribeAvailableDeliveries(setAvailable);
    return unsub;
  }, [driver]);

  useEffect(() => {
    if (!profile) return;
    const unsub = repository.subscribeOrders((all) => {
      setMyActive(
        all.filter(
          (o) => o.driverId === profile.id && o.status !== 'delivered' && o.status !== 'cancelled',
        ),
      );
    });
    return unsub;
  }, [profile]);

  const toggleOnline = async () => {
    if (!driver) return;
    await repository.setDriverOnline(driver.id, !driver.online);
    refresh();
  };

  const accept = async (order: Order) => {
    if (!profile) return;
    setAccepting(order.id);
    try {
      await repository.assignDriver(order.id, profile.id);
      toast.success(`Entrega ${order.code} aceita!`);
      navigate(`/entregador/entrega/${order.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAccepting(null);
    }
  };

  if (loading) return <FullScreenLoader />;

  // Cadastro não aprovado → tela de status
  if (!driver || driver.status !== 'approved') {
    return (
      <DriverStatusScreen
        status={(driver?.status ?? 'pending') as 'pending' | 'rejected' | 'blocked'}
      />
    );
  }

  const todayEarnings = 0; // resumo rápido; detalhado em /ganhos

  return (
    <div className="space-y-5 px-4 pt-4">
      {/* Status online */}
      <div
        className={cn(
          'card flex items-center justify-between p-4 transition-colors',
          driver.online && 'border-success/40 bg-success/5',
        )}
      >
        <div>
          <p className="flex items-center gap-2 font-semibold text-cream">
            <span
              className={cn(
                'h-2.5 w-2.5 rounded-full',
                driver.online ? 'bg-success' : 'bg-ink-5',
              )}
            />
            {driver.online ? 'Você está online' : 'Você está offline'}
          </p>
          <p className="text-xs text-cream-3">
            {driver.online ? 'Recebendo novas entregas' : 'Ative para receber entregas'}
          </p>
        </div>
        <button
          onClick={toggleOnline}
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
            driver.online ? 'bg-success text-cream' : 'bg-ink-3 text-cream-3',
          )}
          aria-label={driver.online ? 'Ficar offline' : 'Ficar online'}
        >
          <Power size={22} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Stat icon={<Wallet size={16} />} label="Hoje" value={formatBRL(todayEarnings)} />
        <Stat icon={<Package size={16} />} label="Entregas" value={String(driver.totalDeliveries)} />
        <Stat icon={<CircleCheck size={16} />} label="Nota" value={driver.rating.toFixed(1)} />
      </div>

      {/* Entregas em andamento */}
      {myActive.length > 0 && (
        <section>
          <h2 className="display mb-2 text-lg text-cream">Em andamento</h2>
          <div className="space-y-2">
            {myActive.map((o) => (
              <button
                key={o.id}
                onClick={() => navigate(`/entregador/entrega/${o.id}`)}
                className="card flex w-full items-center gap-3 p-4 text-left transition-colors hover:border-ink-5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber/15 text-lg">
                  🛵
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-semibold text-cream">{o.code}</p>
                  <p className="truncate text-xs text-cream-3">
                    {o.address ? `${o.address.street}, ${o.address.number}` : 'Retirada'}
                  </p>
                </div>
                <OrderStatusBadge status={o.status} />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Pedidos disponíveis */}
      <section>
        <h2 className="display mb-2 text-lg text-cream">Pedidos disponíveis</h2>
        {!driver.online ? (
          <EmptyState emoji="😴" title="Você está offline" description="Fique online para ver os pedidos." />
        ) : available.length === 0 ? (
          <EmptyState emoji="📭" title="Nenhum pedido agora" description="Assim que sair um pedido, ele aparece aqui." />
        ) : (
          <div className="space-y-3">
            {available.map((o) => {
              const km = o.address
                ? haversineKm(RESTAURANT.location, { lat: o.address.lat, lng: o.address.lng })
                : 0;
              return (
                <div key={o.id} className="card p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-semibold text-cream">{o.code}</span>
                    <span className="font-mono text-sm font-bold text-amber">
                      {formatBRL(o.deliveryFee)}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    <p className="flex items-start gap-2 text-cream-3">
                      <MapPin size={15} className="mt-0.5 shrink-0 text-brand-2" />
                      <span>
                        <span className="font-medium text-cream">Retirar:</span> {RESTAURANT.name}
                      </span>
                    </p>
                    <p className="flex items-start gap-2 text-cream-3">
                      <Navigation size={15} className="mt-0.5 shrink-0 text-success" />
                      <span>
                        <span className="font-medium text-cream">Entregar:</span>{' '}
                        {o.address?.street}, {o.address?.number} — {o.address?.neighborhood}
                      </span>
                    </p>
                    <p className="flex items-center gap-2 text-xs text-cream-3">
                      <Clock size={13} /> {formatKm(km)} · ~{o.etaMinutes ?? 15} min
                    </p>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button variant="ghost" fullWidth size="sm" disabled>
                      Recusar
                    </Button>
                    <Button
                      variant="amber"
                      fullWidth
                      size="sm"
                      loading={accepting === o.id}
                      onClick={() => accept(o)}
                    >
                      Aceitar entrega
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card flex flex-col gap-1 p-3">
      <span className="text-cream-3">{icon}</span>
      <span className="font-mono text-lg font-bold text-cream">{value}</span>
      <span className="text-[11px] text-cream-3">{label}</span>
    </div>
  );
}

function DriverStatusScreen({ status }: { status: 'pending' | 'rejected' | 'blocked' }) {
  const info = {
    pending: {
      emoji: '🟡',
      title: 'Cadastro em análise',
      desc: 'Seu cadastro foi enviado e está sendo avaliado pela administração do Seu Paulo. Você será avisado assim que for aprovado.',
    },
    rejected: {
      emoji: '🔴',
      title: 'Cadastro reprovado',
      desc: 'Infelizmente seu cadastro não foi aprovado. Entre em contato com a administração para mais informações.',
    },
    blocked: {
      emoji: '🚫',
      title: 'Acesso bloqueado',
      desc: 'Seu acesso está temporariamente bloqueado. Fale com a administração.',
    },
  }[status];

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="card max-w-sm p-8 text-center">
        <div className="text-5xl">{info.emoji}</div>
        <h1 className="display mt-4 text-2xl text-cream">{info.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-cream-3">{info.desc}</p>
        <DriverStatusBadge status={status} />
      </div>
    </div>
  );
}
