import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Store, Navigation, Phone, MapPin, Check, PartyPopper } from 'lucide-react';
import { useOrder } from '@/hooks/useOrders';
import { repository } from '@/services';
import { useToast } from '@/providers/ToastProvider';
import { DeliveryMap } from '@/components/maps/DeliveryMap';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { FullScreenLoader } from '@/components/ui/Spinner';
import { formatBRL } from '@/utils/format';
import { RESTAURANT } from '@/data/restaurant';
import { PAYMENT_STATUS_META } from '@/utils/status';
import { cn } from '@/utils/cn';

type Phase = 'to_restaurant' | 'picking_up' | 'delivering' | 'done';

export function ActiveDelivery() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { order, loading } = useOrder(id);

  const [phase, setPhase] = useState<Phase>('to_restaurant');
  const [confirmDeliver, setConfirmDeliver] = useState(false);
  const [working, setWorking] = useState(false);

  // Sincroniza a fase com o status persistido do pedido.
  useEffect(() => {
    if (!order) return;
    if (order.status === 'delivered') setPhase('done');
    else if (order.status === 'on_the_way') setPhase((p) => (p === 'to_restaurant' || p === 'picking_up' ? 'delivering' : p));
  }, [order]);

  if (loading) return <FullScreenLoader />;
  if (!order) {
    return (
      <div className="p-6 text-center text-cream-3">
        Pedido não encontrado.
        <div className="mt-4">
          <Button onClick={() => navigate('/entregador')}>Voltar</Button>
        </div>
      </div>
    );
  }

  const customer = order.address ? { lat: order.address.lat, lng: order.address.lng } : null;

  const startDelivery = async () => {
    setWorking(true);
    try {
      await repository.updateOrderStatus(order.id, 'on_the_way');
      setPhase('delivering');
      toast.success('Entrega iniciada! Boa viagem 🛵');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const confirmDelivery = async () => {
    setWorking(true);
    try {
      await repository.updateOrderStatus(order.id, 'delivered');
      setPhase('done');
      setConfirmDeliver(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const openExternalNav = () => {
    const target = phase === 'delivering' && customer ? customer : RESTAURANT.location;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`, '_blank');
  };

  if (phase === 'done') {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-6">
        <div className="card max-w-sm p-8 text-center">
          <PartyPopper size={48} className="mx-auto text-success" />
          <h1 className="display mt-4 text-2xl text-cream">Entrega concluída!</h1>
          <p className="mt-2 text-sm text-cream-3">
            Pedido {order.code} entregue com sucesso. Você ganhou{' '}
            <span className="font-semibold text-amber">{formatBRL(order.deliveryFee)}</span>.
          </p>
          <Button fullWidth className="mt-6" onClick={() => navigate('/entregador')}>
            Voltar ao painel
          </Button>
        </div>
      </div>
    );
  }

  const steps: { key: Phase; label: string }[] = [
    { key: 'to_restaurant', label: 'Ir ao restaurante' },
    { key: 'picking_up', label: 'Retirar pedido' },
    { key: 'delivering', label: 'Entregar ao cliente' },
  ];
  const phaseIndex = steps.findIndex((s) => s.key === phase);

  return (
    <div className="pb-40">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate('/entregador')} className="text-cream" aria-label="Voltar">
          <ArrowLeft size={22} />
        </button>
        <h1 className="display text-xl text-cream">Entrega {order.code}</h1>
      </div>

      {/* Mapa */}
      <div className="mx-4 mb-4 h-64 overflow-hidden rounded-2xl border border-ink-3">
        <DeliveryMap
          restaurant={RESTAURANT.location}
          customer={customer}
          driver={order.driverLocation ?? RESTAURANT.location}
          showRoute={phase === 'delivering'}
          fitKey={`${phase}-${order.driverLocation?.lat}`}
        />
      </div>

      {/* Passos */}
      <div className="mx-4 mb-4 flex gap-2">
        {steps.map((s, i) => (
          <div key={s.key} className="flex-1">
            <div
              className={cn(
                'h-1.5 rounded-full transition-colors',
                i <= phaseIndex ? 'bg-amber' : 'bg-ink-3',
              )}
            />
            <p className={cn('mt-1.5 text-[11px]', i <= phaseIndex ? 'text-cream' : 'text-cream-3')}>
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Destino atual */}
      <div className="mx-4 card p-4">
        {phase === 'delivering' ? (
          <div className="flex items-start gap-3">
            <MapPin size={20} className="mt-0.5 text-success" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-cream-3">Entregar para {order.customerName}</p>
              <p className="font-semibold text-cream">
                {order.address?.street}, {order.address?.number}
              </p>
              <p className="text-sm text-cream-3">
                {order.address?.complement} · {order.address?.neighborhood}
              </p>
              {order.address?.reference && (
                <p className="mt-1 text-xs italic text-cream-3">Ref.: {order.address.reference}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <Store size={20} className="mt-0.5 text-brand-2" />
            <div>
              <p className="text-xs text-cream-3">Retirar no</p>
              <p className="font-semibold text-cream">{RESTAURANT.name}</p>
              <p className="text-sm text-cream-3">
                {RESTAURANT.address}, {RESTAURANT.neighborhood}
              </p>
            </div>
          </div>
        )}

        {/* Pagamento a receber (dinheiro) */}
        <div className="mt-3 flex items-center justify-between border-t border-ink-3 pt-3 text-sm">
          <span className="text-cream-3">
            {order.paymentMethod === 'cash' ? 'Receber em dinheiro' : 'Pagamento'}
          </span>
          <span className="font-semibold text-cream">
            {order.paymentMethod === 'cash'
              ? `${formatBRL(order.total)}${order.changeFor ? ` · troco p/ ${formatBRL(order.changeFor)}` : ''}`
              : PAYMENT_STATUS_META[order.paymentStatus].label}
          </span>
        </div>
      </div>

      {/* Ações rápidas */}
      <div className="mx-4 mt-4 grid grid-cols-2 gap-3">
        <Button variant="ghost" leftIcon={<Navigation size={16} />} onClick={openExternalNav}>
          Navegar
        </Button>
        <a href={`tel:${order.customerPhone.replace(/\D/g, '')}`}>
          <Button variant="ghost" fullWidth leftIcon={<Phone size={16} />}>
            Ligar p/ cliente
          </Button>
        </a>
      </div>

      {/* Barra de ação principal */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg border-t border-ink-3 bg-ink-2/95 p-4 backdrop-blur">
        {phase === 'to_restaurant' && (
          <Button fullWidth size="lg" variant="amber" onClick={() => setPhase('picking_up')}>
            Cheguei ao restaurante
          </Button>
        )}
        {phase === 'picking_up' && (
          <Button fullWidth size="lg" variant="amber" loading={working} onClick={startDelivery}>
            Retirei o pedido · Iniciar entrega
          </Button>
        )}
        {phase === 'delivering' && (
          <Button
            fullWidth
            size="lg"
            leftIcon={<Check size={18} />}
            onClick={() => setConfirmDeliver(true)}
          >
            Confirmar entrega
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeliver}
        onClose={() => setConfirmDeliver(false)}
        onConfirm={confirmDelivery}
        title="Confirmar entrega"
        message={`Confirma que o pedido ${order.code} foi entregue ao cliente?`}
        confirmLabel="Sim, entreguei"
        loading={working}
      />
    </div>
  );
}
