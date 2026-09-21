import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bike, Store, Plus, MapPin, Check, QrCode, CreditCard, Banknote } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { useToast } from '@/providers/ToastProvider';
import { repository } from '@/services';
import { paymentProvider } from '@/services/payments';
import type { Address, FulfillmentType, PaymentMethod } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FullScreenLoader } from '@/components/ui/Spinner';
import { formatBRL } from '@/utils/format';
import { calcDeliveryFee, isWithinDeliveryRadius } from '@/utils/geo';
import { RESTAURANT } from '@/data/restaurant';
import { cn } from '@/utils/cn';

const PAYMENTS: { value: PaymentMethod; label: string; icon: typeof QrCode; hint: string }[] = [
  { value: 'pix', label: 'PIX', icon: QrCode, hint: 'Aprovação na hora' },
  { value: 'card', label: 'Cartão', icon: CreditCard, hint: 'Crédito ou débito na entrega' },
  { value: 'cash', label: 'Dinheiro', icon: Banknote, hint: 'Pague na entrega' },
];

export function Checkout() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { items, subtotal, discount, coupon, clear } = useCart();
  const toast = useToast();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loadingAddr, setLoadingAddr] = useState(true);
  const [fulfillment, setFulfillment] = useState<FulfillmentType>('delivery');
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>('pix');
  const [needsChange, setNeedsChange] = useState(false);
  const [changeFor, setChangeFor] = useState('');
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (items.length === 0) navigate('/app/carrinho', { replace: true });
  }, [items.length, navigate]);

  useEffect(() => {
    if (!profile) return;
    repository.getAddresses(profile.id).then((list) => {
      setAddresses(list);
      setSelectedAddressId(list.find((a) => a.isDefault)?.id ?? list[0]?.id ?? null);
      setLoadingAddr(false);
    });
  }, [profile]);

  const selectedAddress = useMemo(
    () => addresses.find((a) => a.id === selectedAddressId) ?? null,
    [addresses, selectedAddressId],
  );

  const deliveryFee = useMemo(() => {
    if (fulfillment === 'pickup' || !selectedAddress) return 0;
    return calcDeliveryFee({ lat: selectedAddress.lat, lng: selectedAddress.lng });
  }, [fulfillment, selectedAddress]);

  const total = subtotal - discount + deliveryFee;

  const outOfRange =
    fulfillment === 'delivery' &&
    selectedAddress != null &&
    !isWithinDeliveryRadius({ lat: selectedAddress.lat, lng: selectedAddress.lng });

  const canPlace =
    !placing &&
    (fulfillment === 'pickup' || (selectedAddress != null && !outOfRange)) &&
    (!needsChange || Number(changeFor.replace(',', '.')) >= total);

  const placeOrder = async () => {
    if (!profile) return;
    setPlacing(true);
    try {
      const changeValue =
        payment === 'cash' && needsChange ? Number(changeFor.replace(',', '.')) : undefined;

      const order = await repository.createOrder({
        customer: profile,
        items,
        fulfillment,
        address: fulfillment === 'delivery' ? selectedAddress : null,
        subtotal,
        deliveryFee,
        discount,
        total,
        couponCode: coupon?.code,
        paymentMethod: payment,
        changeFor: changeValue,
      });

      // Camada de pagamento isolada (demo). Em produção, o gateway confirma via webhook.
      await paymentProvider.createIntent(order.id, total, payment);

      clear();
      toast.success('Pedido realizado! Acompanhe em tempo real. 🍻');
      navigate(`/app/pedido/${order.id}`, { replace: true });
    } catch (err) {
      toast.error((err as Error).message);
      setPlacing(false);
    }
  };

  if (loadingAddr) return <FullScreenLoader />;

  return (
    <div className="pb-40 pt-4">
      <div className="mb-4 flex items-center gap-3 px-4">
        <button onClick={() => navigate(-1)} className="text-cream" aria-label="Voltar">
          <ArrowLeft size={22} />
        </button>
        <h1 className="display text-2xl text-cream">Finalizar pedido</h1>
      </div>

      <div className="space-y-6 px-4">
        {/* Tipo de entrega */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-cream-3">Como você quer receber?</h2>
          <div className="grid grid-cols-2 gap-3">
            <OptionCard
              active={fulfillment === 'delivery'}
              onClick={() => setFulfillment('delivery')}
              icon={<Bike size={20} />}
              title="Entrega"
              subtitle="Levamos até você"
            />
            <OptionCard
              active={fulfillment === 'pickup'}
              onClick={() => setFulfillment('pickup')}
              icon={<Store size={20} />}
              title="Retirar no local"
              subtitle="Buscar no buteco"
            />
          </div>
        </section>

        {/* Endereço (só entrega) */}
        {fulfillment === 'delivery' && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-cream-3">Endereço de entrega</h2>
              <button
                onClick={() => navigate('/app/enderecos')}
                className="flex items-center gap-1 text-sm font-semibold text-brand-2"
              >
                <Plus size={14} /> Novo
              </button>
            </div>
            {addresses.length === 0 ? (
              <button
                onClick={() => navigate('/app/enderecos')}
                className="card flex w-full items-center gap-3 p-4 text-left"
              >
                <MapPin size={18} className="text-brand-2" />
                <span className="text-sm text-cream-3">Adicione um endereço para continuar</span>
              </button>
            ) : (
              <div className="space-y-2">
                {addresses.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAddressId(a.id)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                      selectedAddressId === a.id
                        ? 'border-brand bg-brand/10'
                        : 'border-ink-4 hover:border-ink-5',
                    )}
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-ink-5">
                      {selectedAddressId === a.id && (
                        <span className="h-3 w-3 rounded-full bg-brand" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-semibold text-cream">
                        {labelEmoji(a.label)} {a.street}, {a.number}
                      </span>
                      <span className="block truncate text-xs text-cream-3">
                        {a.neighborhood}, {a.city} · {a.complement}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {outOfRange && (
              <p className="mt-2 text-xs text-danger">
                Este endereço está fora do nosso raio de entrega de {RESTAURANT.deliveryRadiusKm} km.
              </p>
            )}
          </section>
        )}

        {fulfillment === 'pickup' && (
          <div className="card flex items-start gap-3 p-4">
            <Store size={18} className="mt-0.5 text-amber" />
            <div className="text-sm">
              <p className="font-semibold text-cream">Retirada no {RESTAURANT.name}</p>
              <p className="text-cream-3">
                {RESTAURANT.address}, {RESTAURANT.neighborhood} — {RESTAURANT.city}/{RESTAURANT.state}
              </p>
            </div>
          </div>
        )}

        {/* Pagamento */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-cream-3">Forma de pagamento</h2>
          <div className="space-y-2">
            {PAYMENTS.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.value}
                  onClick={() => setPayment(p.value)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                    payment === p.value ? 'border-brand bg-brand/10' : 'border-ink-4 hover:border-ink-5',
                  )}
                >
                  <Icon size={20} className="text-cream" />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-cream">{p.label}</span>
                    <span className="block text-xs text-cream-3">{p.hint}</span>
                  </span>
                  {payment === p.value && <Check size={18} className="text-brand-2" />}
                </button>
              );
            })}
          </div>

          {/* Troco */}
          {payment === 'cash' && (
            <div className="mt-3 rounded-xl border border-ink-4 p-3">
              <label className="flex items-center justify-between">
                <span className="text-sm text-cream">Precisa de troco?</span>
                <input
                  type="checkbox"
                  checked={needsChange}
                  onChange={(e) => setNeedsChange(e.target.checked)}
                  className="h-4 w-4 accent-brand"
                />
              </label>
              {needsChange && (
                <div className="mt-3">
                  <Input
                    label="Troco para quanto?"
                    inputMode="decimal"
                    placeholder="Ex.: 100,00"
                    value={changeFor}
                    onChange={(e) => setChangeFor(e.target.value)}
                    error={
                      changeFor && Number(changeFor.replace(',', '.')) < total
                        ? 'O valor deve ser maior que o total.'
                        : null
                    }
                  />
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Resumo + confirmar */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg space-y-2 border-t border-ink-3 bg-ink-2/95 p-4 backdrop-blur">
        <div className="space-y-1 text-sm">
          <SummaryRow label="Subtotal" value={formatBRL(subtotal)} />
          {discount > 0 && (
            <SummaryRow label="Desconto" value={`- ${formatBRL(discount)}`} className="text-success" />
          )}
          <SummaryRow
            label="Taxa de entrega"
            value={fulfillment === 'pickup' ? 'Grátis (retirada)' : formatBRL(deliveryFee)}
          />
          <div className="flex items-center justify-between border-t border-ink-3 pt-1.5 text-base font-bold text-cream">
            <span>Total</span>
            <span className="font-mono">{formatBRL(total)}</span>
          </div>
        </div>
        <Button fullWidth size="lg" onClick={placeOrder} loading={placing} disabled={!canPlace}>
          Confirmar pedido · {formatBRL(total)}
        </Button>
      </div>
    </div>
  );
}

function labelEmoji(label: Address['label']) {
  return label === 'casa' ? '🏠' : label === 'trabalho' ? '💼' : '📍';
}

function OptionCard({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors',
        active ? 'border-brand bg-brand/10' : 'border-ink-4 hover:border-ink-5',
      )}
    >
      <span className={active ? 'text-brand-2' : 'text-cream'}>{icon}</span>
      <span className="text-sm font-semibold text-cream">{title}</span>
      <span className="text-xs text-cream-3">{subtitle}</span>
    </button>
  );
}

function SummaryRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-cream-3">{label}</span>
      <span className={className ?? 'text-cream'}>{value}</span>
    </div>
  );
}
