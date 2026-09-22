import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X, Ban, Star, Package, RotateCcw, FileText } from 'lucide-react';
import { repository } from '@/services';
import { useToast } from '@/providers/ToastProvider';
import type { Driver, DriverStatus, Profile } from '@/types';
import { Button } from '@/components/ui/Button';
import { DriverStatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/Modal';
import { cn } from '@/utils/cn';

const VEHICLE_LABEL = { moto: '🏍️ Moto', carro: '🚗 Carro', bicicleta: '🚲 Bike' };
const FILTERS: { value: DriverStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Em análise' },
  { value: 'approved', label: 'Aprovados' },
  { value: 'rejected', label: 'Reprovados' },
  { value: 'blocked', label: 'Bloqueados' },
];

export function AdminDrivers() {
  const toast = useToast();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DriverStatus | 'all'>('all');
  const [confirm, setConfirm] = useState<{ driver: Driver; status: DriverStatus } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const list = await repository.getDrivers();
    setDrivers(list);
    const map: Record<string, Profile> = {};
    await Promise.all(
      list.map(async (d) => {
        const p = await repository.getProfileById(d.id);
        if (p) map[d.id] = p;
      }),
    );
    setProfiles(map);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () => (filter === 'all' ? drivers : drivers.filter((d) => d.status === filter)),
    [drivers, filter],
  );

  const apply = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await repository.setDriverStatus(confirm.driver.id, confirm.status);
      toast.success('Status do entregador atualizado.');
      setConfirm(null);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="display text-3xl text-cream">Entregadores</h1>

      <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
              filter === f.value ? 'border-brand bg-brand text-cream' : 'border-ink-4 text-cream-3 hover:border-ink-5',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-10 text-center text-cream-3">Carregando…</p>
      ) : filtered.length === 0 ? (
        <EmptyState emoji="🛵" title="Nenhum entregador" description="Não há entregadores neste filtro." />
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((d) => {
            const p = profiles[d.id];
            return (
              <div key={d.id} className="card p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-amber/15 text-lg">
                      🛵
                      <span
                        className={cn(
                          'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink-2',
                          d.online ? 'bg-success' : 'bg-ink-5',
                        )}
                      />
                    </span>
                    <div>
                      <p className="font-semibold text-cream">{p?.fullName ?? 'Entregador'}</p>
                      <p className="text-xs text-cream-3">{p?.phone ?? ''}</p>
                    </div>
                  </div>
                  <DriverStatusBadge status={d.status} />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-ink-3/50 p-3 text-xs">
                  <span className="text-cream-3">Veículo</span>
                  <span className="text-right text-cream">{VEHICLE_LABEL[d.vehicleType]}</span>
                  <span className="text-cream-3">Modelo</span>
                  <span className="text-right text-cream">{d.model}</span>
                  <span className="text-cream-3">Placa</span>
                  <span className="text-right font-mono text-cream">{d.plate}</span>
                </div>

                <div className="mt-3 flex items-center gap-4 text-xs text-cream-3">
                  <span className="flex items-center gap-1">
                    <Star size={13} className="text-amber" /> {d.rating.toFixed(1)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Package size={13} /> {d.totalDeliveries} entregas
                  </span>
                </div>

                <div className="mt-3 flex gap-2">
                  {d.status === 'pending' && (
                    <>
                      <Button size="sm" fullWidth leftIcon={<Check size={15} />} onClick={() => setConfirm({ driver: d, status: 'approved' })}>
                        Aprovar
                      </Button>
                      <Button size="sm" variant="ghost" leftIcon={<X size={15} />} onClick={() => setConfirm({ driver: d, status: 'rejected' })}>
                        Reprovar
                      </Button>
                    </>
                  )}
                  {d.status === 'approved' && (
                    <Button size="sm" variant="danger" fullWidth leftIcon={<Ban size={15} />} onClick={() => setConfirm({ driver: d, status: 'blocked' })}>
                      Bloquear
                    </Button>
                  )}
                  {(d.status === 'rejected' || d.status === 'blocked') && (
                    <Button size="sm" variant="ghost" fullWidth leftIcon={<RotateCcw size={15} />} onClick={() => setConfirm({ driver: d, status: 'approved' })}>
                      Reativar
                    </Button>
                  )}
                </div>

                <Link
                  to={`/solicitacoes?user=${d.id}`}
                  className="mt-2 flex items-center justify-center gap-1.5 text-xs font-medium text-brand-2 hover:underline"
                >
                  <FileText size={13} /> Ver cadastro completo
                </Link>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={apply}
        title="Alterar status"
        message={
          confirm
            ? `Confirmar alteração do status deste entregador para "${confirm.status}"?`
            : ''
        }
        confirmLabel="Confirmar"
        danger={confirm?.status === 'blocked' || confirm?.status === 'rejected'}
        loading={busy}
      />
    </div>
  );
}
