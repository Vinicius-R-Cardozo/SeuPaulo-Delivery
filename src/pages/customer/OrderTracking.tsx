import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Phone, Bike, Store, Clock, MapPin, KeyRound, Copy, Check } from 'lucide-react';
import { useOrder } from '@/hooks/useOrders';
import { repository } from '@/services';
import { useToast } from '@/providers/ToastProvider';
import type { Driver } from '@/types';
import { DeliveryMap } from '@/components/maps/DeliveryMap';
import { FullScreenLoader } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { OrderStatusBadge } from '@/components/ui/StatusBadge';
import { formatBRL, formatTime } from '@/utils/format';
import { estimateRemainingDeliveryMinutes } from '@/utils/geo';
import { ORDER_FLOW, ORDER_STATUS_META } from '@/utils/status';
import { RESTAURANT } from '@/data/restaurant';
import { cn } from '@/utils/cn';

export function OrderTracking() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { order, loading } = useOrder(id);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (order?.driverId) repository.getDriver(order.driverId).then(setDriver).catch(() => {});
  }, [order?.driverId]);

  // Busca o código de entrega quando o pedido está perto de ser entregue.
  const nearDelivery =
    order?.fulfillment === 'delivery' &&
    (order.status === 'on_the_way' || order.status === 'arrived');
  useEffect(() => {
    let active = true;
    setDeliveryCode(null);
    if (!nearDelivery || !id) return;
    const load = () => void repository.getDeliveryCode(id).then(code => { if (active) setDeliveryCode(code); });
    load();
    const timer = window.setInterval(load, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [nearDelivery, id]);

  if (loading) return <FullScreenLoader label="Carregando seu pedido…" />;
  if (!order)
    return (
      <EmptyState
        emoji="🤔"
        title="Pedido não encontrado"
        action={<Button onClick={() => navigate('/app/pedidos')}>Meus pedidos</Button>}
      />
    );

  const isDelivery = order.fulfillment === 'delivery';
  const destination = nearDelivery ? order.address : null;
  const remainingMinutes = destination && order.driverLocation
    ? estimateRemainingDeliveryMinutes(order.driverLocation, destination)
    : null;
  const estimatedMinutes = remainingMinutes ?? order.etaMinutes ?? RESTAURANT.avgPrepMinutes;
  const deliveryStatus = order.status === 'arrived'
    ? 'Seu entregador chegou'
    : nearDelivery && remainingMinutes === null
      ? 'Pedido a caminho'
      : `Previsão de entrega ~${estimatedMinutes} min`;
  const currentStep = ORDER_STATUS_META[order.status].step;
  const cancelled = order.status === 'cancelled';
  const cancellation = cancelled ? order.statusHistory.at(-1) : undefined;

  const copyCode = () => {
    if (!deliveryCode) return;
    navigator.clipboard?.writeText(deliveryCode);
    setCopied(true);
    toast.success('Código copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4">
        <button onClick={() => navigate('/app/pedidos')} className="text-cream" aria-label="Voltar">
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1 className="display text-xl text-cream">Pedido {order.code}</h1>
          <p className="text-xs text-cream-3">Feito às {formatTime(order.createdAt)}</p>
        </div>
        <div className="ml-auto">
          <OrderStatusBadge status={order.status} />
        </div>
      </div>

      {/* Mapa ao vivo */}
      {destination && (
        <div className="mx-4 mb-4 overflow-hidden rounded-2xl border border-ink-3">
          <div className="h-64">
            <DeliveryMap
              restaurant={RESTAURANT.location}
              customer={destination}
              driver={order.driverLocation}
              fitKey={order.status}
            />
          </div>
          <div className="flex items-center gap-3 bg-ink-2 px-4 py-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber/15 text-amber">
              <span className="map-courier-icon" aria-hidden="true" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-cream">
                {deliveryStatus}
              </p>
              <p className="text-xs text-cream-3">
                {order.driverLocationAt ? `Última localização às ${formatTime(order.driverLocationAt)}` : 'Aguardando a localização do entregador'}
              </p>
            </div>
            {driver && (
              <a
                href={`tel:${RESTAURANT.phoneLink}`}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-cream"
                aria-label="Ligar para o entregador"
              >
                <Phone size={18} />
              </a>
            )}
          </div>
        </div>
      )}

      {/* ETA card (quando ainda não saiu) */}
      {!destination && !cancelled && (
        <div className="mx-4 mb-4 flex items-center gap-3 rounded-2xl border border-ink-3 bg-ink-2 p-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/15 text-brand-2">
            {isDelivery ? <Bike size={20} /> : <Store size={20} />}
          </span>
          <div>
            <p className="text-sm font-semibold text-cream">
              {order.status === 'delivered'
                ? isDelivery
                  ? 'Pedido entregue 🎉'
                  : 'Pedido retirado 🎉'
                : isDelivery
                  ? deliveryStatus
                  : `Pronto para retirar em ~${RESTAURANT.avgPrepMinutes} min`}
            </p>
            <p className="flex items-center gap-1 text-xs text-cream-3">
              <Clock size={12} /> Atualizado às {formatTime(order.updatedAt)}
            </p>
          </div>
        </div>
      )}

      {/* Código de entrega — destacado quando o pedido está perto de chegar */}
      {nearDelivery && (
        <div
          className={cn(
            'mx-4 mb-4 rounded-2xl border p-5',
            order.status === 'arrived'
              ? 'border-amber bg-amber/10'
              : 'border-ink-3 bg-ink-2',
          )}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-cream">
            <KeyRound size={16} className="text-amber" />
            Código de entrega
          </div>
          <p className="mt-1 text-xs text-cream-3">
            {order.status === 'arrived'
              ? 'O entregador chegou! Informe este código para ele finalizar a entrega.'
              : 'Quando o entregador chegar, informe este código para confirmar a entrega.'}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <span className="flex-1 rounded-xl bg-ink px-4 py-3 text-center font-mono text-3xl font-bold tracking-[0.3em] text-amber">
              {deliveryCode ?? '••••••'}
            </span>
            <button
              onClick={copyCode}
              disabled={!deliveryCode}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-ink-4 text-cream hover:border-brand-2 disabled:opacity-40"
              aria-label="Copiar código"
            >
              {copied ? <Check size={20} className="text-success" /> : <Copy size={20} />}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-cream-3">
            🔒 Nunca compartilhe o código antes de o entregador chegar.
          </p>
        </div>
      )}

      {/* Timeline */}
      <div className="mx-4 mb-4 card p-5">
        <h2 className="display mb-4 text-base text-cream">Acompanhe seu pedido</h2>
        {cancelled ? (
          <div role="status" className="rounded-lg bg-danger/10 p-3 text-sm">
            <p className="font-semibold text-danger">
              {cancellation?.cancelledBy === 'store' ? 'A loja cancelou seu pedido.' : 'Este pedido foi cancelado.'}
            </p>
            {cancellation?.cancelledBy === 'store' && cancellation.note && (
              <p className="mt-1 break-words text-cream">{cancellation.note}</p>
            )}
          </div>
        ) : (
          <ol className="relative space-y-5">
            {(isDelivery ? (['received','confirmed','accepted','at_restaurant','on_the_way','arrived','delivered'] as const)
              : ORDER_FLOW.filter(s => s !== 'on_the_way' && s !== 'arrived')).map((status) => {
              const meta = ORDER_STATUS_META[status];
              const event = order.statusHistory.find((e) => e.status === status);
              const done = meta.step <= currentStep;
              const isCurrent = meta.step === currentStep;
              return (
                <li key={status} className="flex items-start gap-3">
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm transition-colors',
                      done ? 'bg-brand text-cream' : 'bg-ink-3 text-cream-3',
                      isCurrent && 'ring-2 ring-amber ring-offset-2 ring-offset-ink-2',
                    )}
                  >
                    {meta.emoji}
                  </span>
                  <div className="flex-1 pt-1">
                    <p className={cn('text-sm font-medium', done ? 'text-cream' : 'text-cream-3')}>
                      {status === 'on_the_way' && !isDelivery ? 'A caminho' : meta.label}
                    </p>
                    {event && <p className="text-xs text-cream-3">{formatTime(event.at)}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Resumo do pedido */}
      <div className="mx-4 card p-5">
        <h2 className="display mb-3 text-base text-cream">Resumo</h2>
        <div className="space-y-2">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span className="text-cream">
                {item.quantity}× {item.product.name}
                {item.addons.length > 0 && (
                  <span className="block text-xs text-cream-3">
                    {item.addons.map((a) => a.optionName).join(', ')}
                  </span>
                )}
              </span>
              <span className="font-mono text-cream-3">
                {formatBRL(item.unitPrice * item.quantity)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1 border-t border-ink-3 pt-3 text-sm">
          <div className="flex justify-between text-cream-3">
            <span>Subtotal</span>
            <span className="font-mono">{formatBRL(order.subtotal)}</span>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between text-success">
              <span>Desconto {order.couponCode ? `(${order.couponCode})` : ''}</span>
              <span className="font-mono">- {formatBRL(order.discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-cream-3">
            <span>Entrega</span>
            <span className="font-mono">
              {order.fulfillment === 'pickup' ? 'Retirada' : formatBRL(order.deliveryFee)}
            </span>
          </div>
          <div className="flex justify-between pt-1 font-bold text-cream">
            <span>Total</span>
            <span className="font-mono">{formatBRL(order.total)}</span>
          </div>
        </div>

        {order.address && (
          <div className="mt-4 flex items-start gap-2 border-t border-ink-3 pt-3 text-xs text-cream-3">
            <MapPin size={14} className="mt-0.5 shrink-0 text-brand-2" />
            <span>
              {order.address.street}, {order.address.number}
              {order.address.complement ? ` · ${order.address.complement}` : ''} —{' '}
              {order.address.neighborhood}, {order.address.city}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
