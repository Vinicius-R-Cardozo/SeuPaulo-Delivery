import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Store, Navigation, Phone, MapPin, PartyPopper, KeyRound, BellRing } from 'lucide-react';
import { useOrder } from '@/hooks/useOrders';
import { repository } from '@/services';
import { useToast } from '@/providers/ToastProvider';
import { DeliveryMap } from '@/components/maps/DeliveryMap';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { FullScreenLoader } from '@/components/ui/Spinner';
import { formatBRL } from '@/utils/format';
import { RESTAURANT } from '@/data/restaurant';
import { PAYMENT_STATUS_META } from '@/utils/status';
import { prepareTracking, startTracking, stopTracking } from '@/services/deliveryTracking';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/utils/cn';

export function ActiveDelivery() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { order, loading } = useOrder(id);

  const { profile } = useAuth();
  const [gpsError, setGpsError] = useState('');
  const [working, setWorking] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  const mine = !!profile && order?.driverId === profile.id;
  const resume = async () => {
    if (!order || !mine) return;
    try {
      await startTracking(order.id);
      setGpsError('');
    } catch {
      setGpsError('Ative a localização para compartilhar o trajeto com o cliente.');
    }
  };
  useEffect(() => {
    if (mine && order?.status === 'on_the_way') void resume();
    if (mine && order && ['arrived','delivered','cancelled'].includes(order.status)) void stopTracking(order.id);
  }, [mine, order?.id, order?.status]);

  if (loading) return <FullScreenLoader />;
  if (!order || !mine || order.status === 'cancelled') {
    return (
      <div className="p-6 text-center text-cream-3">
        Entrega indisponível.
        <div className="mt-4">
          <Button onClick={() => navigate('/entregador')}>Voltar</Button>
        </div>
      </div>
    );
  }

  const customer = order.address ? { lat: order.address.lat, lng: order.address.lng } : null;
  const dispatched = order.status === 'on_the_way' || order.status === 'arrived';

  // Estágio atual da UI.
  const stage: 'to_restaurant' | 'picking_up' | 'delivering' | 'arrived' | 'done' =
    order.status === 'delivered'
      ? 'done'
      : order.status === 'arrived'
        ? 'arrived'
        : order.status === 'on_the_way'
          ? 'delivering'
          : order.status === 'at_restaurant' ? 'picking_up' : 'to_restaurant';

  const advance = async (status: 'at_restaurant' | 'on_the_way') => {
    setWorking(true);
    try {
      if (status === 'on_the_way') await prepareTracking();
      await repository.updateOrderStatus(order.id, status);
      if (status === 'on_the_way') await resume();

    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const markArrived = async () => {
    setWorking(true);
    try {
      await repository.updateOrderStatus(order.id, 'arrived');
      await stopTracking(order.id);
      toast.info('Cliente avisado. Peça o código de entrega. 🔔');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const submitCode = async () => {
    const clean = code.replace(/\D/g, '');
    if (clean.length !== 6) {
      setCodeError('Digite o código informado pelo cliente.');
      return;
    }
    setWorking(true);
    setCodeError(null);
    try {
      const res = await repository.confirmDelivery(order.id, clean);
      if (res.ok) {
        setCodeOpen(false);
        setCode('');
        toast.success('Entrega confirmada! ✅');
      } else {
        setCodeError(res.error ?? 'Código inválido.');
      }
    } catch (err) {
      setCodeError((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const openExternalNav = () => {
    const target = dispatched && customer ? customer : RESTAURANT.location;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`,
      '_blank',
    );
  };

  if (stage === 'done') {
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

  const steps = [
    { key: 'to_restaurant', label: 'Ir ao restaurante' },
    { key: 'picking_up', label: 'Retirar pedido' },
    { key: 'delivering', label: 'A caminho' },
    { key: 'arrived', label: 'Entregar (código)' },
  ];
  const order5 = ['to_restaurant', 'picking_up', 'delivering', 'arrived'];
  const phaseIndex = order5.indexOf(stage);

  return (
    <div className="pb-40">
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate('/entregador')} className="text-cream" aria-label="Voltar">
          <ArrowLeft size={22} />
        </button>
        <h1 className="display text-xl text-cream">Entrega {order.code}</h1>
      </div>

      {gpsError && stage === 'delivering' && <div className="mx-4 mb-3 text-sm text-amber" role="alert">
        {gpsError} <button className="underline" onClick={() => void prepareTracking().then(resume).catch(() => setGpsError('Permita a localização nos ajustes do aparelho e tente de novo.'))}>Tentar novamente</button>
      </div>}
      <div className="mx-4 mb-4 h-64 overflow-hidden rounded-2xl border border-ink-3">
        <DeliveryMap
          restaurant={RESTAURANT.location}
          customer={customer}
          driver={order.driverLocation}
          fitKey={stage}
        />
      </div>

      <div className="mx-4 mb-4 flex gap-2">
        {steps.map((s, i) => (
          <div key={s.key} className="flex-1">
            <div className={cn('h-1.5 rounded-full', i <= phaseIndex ? 'bg-amber' : 'bg-ink-3')} />
            <p className={cn('mt-1.5 text-[10px]', i <= phaseIndex ? 'text-cream' : 'text-cream-3')}>
              {s.label}
            </p>
          </div>
        ))}
      </div>

      <div className="mx-4 card p-4">
        {dispatched ? (
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

        {stage === 'arrived' && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber/10 p-3 text-xs text-amber">
            <KeyRound size={15} className="mt-0.5 shrink-0" />
            <span>
              Peça ao cliente o <b>código de entrega</b> e digite-o para finalizar. Sem o código, a
              entrega não pode ser concluída.
            </span>
          </div>
        )}

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

      <div className="mx-4 mt-4 grid grid-cols-2 gap-3">
        <Button variant="ghost" leftIcon={<Navigation size={16} />} disabled={working} onClick={openExternalNav}>
          Navegar
        </Button>
        <a href={`tel:${order.customerPhone.replace(/\D/g, '')}`}>
          <Button variant="ghost" fullWidth leftIcon={<Phone size={16} />}>
            Ligar p/ cliente
          </Button>
        </a>
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg border-t border-ink-3 bg-ink-2/95 p-4 backdrop-blur">
        {stage === 'to_restaurant' && (
          <Button fullWidth size="lg" variant="amber" loading={working} onClick={() => advance('at_restaurant')}>
            Cheguei ao restaurante
          </Button>
        )}
        {stage === 'picking_up' && (
          <Button fullWidth size="lg" variant="amber" loading={working} onClick={() => advance('on_the_way')}>
            Retirei o pedido · Iniciar entrega
          </Button>
        )}
        {stage === 'delivering' && (
          <Button fullWidth size="lg" variant="amber" loading={working} leftIcon={<BellRing size={18} />} onClick={markArrived}>
            Cheguei ao cliente
          </Button>
        )}
        {stage === 'arrived' && (
          <Button
            fullWidth
            size="lg"
            leftIcon={<KeyRound size={18} />}
            onClick={() => {
              setCode('');
              setCodeError(null);
              setCodeOpen(true);
            }}
          >
            Finalizar entrega
          </Button>
        )}
      </div>

      {/* Modal do código de entrega */}
      <Modal
        open={codeOpen}
        onClose={() => setCodeOpen(false)}
        title="Código de entrega"
        footer={
          <Button fullWidth size="lg" loading={working} onClick={submitCode}>
            Confirmar entrega
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-cream-3">
            Peça ao cliente o código de 6 dígitos que aparece no app dele e digite abaixo.
          </p>
          <Input
            label="Código informado pelo cliente"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            error={codeError}
            enterKeyHint="done"
            onKeyDown={e => {
              if (e.key === 'Enter' && !working) {
                e.currentTarget.blur();
                void submitCode();
              }
            }}
            inputMode="numeric"
            placeholder="Ex.: 482731"
            leftIcon={<KeyRound size={16} />}
            className="text-center font-mono text-lg tracking-[0.4em]"
          />
        </div>
      </Modal>
    </div>
  );
}
