import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, Tag, X, TicketPercent } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { useToast } from '@/providers/ToastProvider';
import { repository } from '@/services';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/Modal';
import { formatBRL } from '@/utils/format';
import { RESTAURANT } from '@/data/restaurant';

export function Cart() {
  const navigate = useNavigate();
  const toast = useToast();
  const { items, subtotal, discount, coupon, updateQuantity, removeItem, applyCoupon, removeCoupon } =
    useCart();

  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState<string | null>(null);

  const belowMin = subtotal < RESTAURANT.minOrder;

  const applyCouponCode = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError(null);
    try {
      const c = await repository.validateCoupon(couponCode, subtotal);
      applyCoupon(c);
      toast.success(`Cupom ${c.code} aplicado! 🎉`);
      setCouponCode('');
    } catch (err) {
      setCouponError((err as Error).message);
    } finally {
      setCouponLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="pt-4">
        <Header onBack={() => navigate('/app')} />
        <EmptyState
          emoji="🛒"
          title="Seu carrinho está vazio"
          description="Que tal um torresmo pra começar?"
          action={<Button onClick={() => navigate('/app/cardapio')}>Ver cardápio</Button>}
        />
      </div>
    );
  }

  return (
    <div className="pb-40 pt-4">
      <Header onBack={() => navigate(-1)} />

      <div className="space-y-3 px-4">
        {items.map((item) => (
          <div key={item.id} className="card p-3">
            <div className="flex gap-3">
              <img
                src={item.product.image}
                alt=""
                className="h-16 w-16 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-cream">{item.product.name}</h3>
                  <button
                    onClick={() => setConfirmClear(item.id)}
                    className="shrink-0 text-cream-3 hover:text-danger"
                    aria-label="Remover item"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {item.addons.length > 0 && (
                  <p className="mt-0.5 text-xs text-cream-3">
                    {item.addons.map((a) => a.optionName).join(', ')}
                  </p>
                )}
                {item.notes && (
                  <p className="mt-0.5 text-xs italic text-cream-3">“{item.notes}”</p>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <QuantityStepper
                    value={item.quantity}
                    onChange={(q) => updateQuantity(item.id, q)}
                    min={1}
                    size="sm"
                  />
                  <span className="font-mono text-sm font-semibold text-amber">
                    {formatBRL(item.unitPrice * item.quantity)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Cupom */}
        <div className="card p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-cream">
            <TicketPercent size={16} className="text-amber" /> Cupom de desconto
          </p>
          {coupon ? (
            <div className="flex items-center justify-between rounded-lg border border-success/40 bg-success/10 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm text-cream">
                <Tag size={14} className="text-success" />
                <span className="font-mono font-semibold">{coupon.code}</span>
                <span className="text-cream-3">— {coupon.description}</span>
              </span>
              <button
                onClick={removeCoupon}
                className="text-cream-3 hover:text-danger"
                aria-label="Remover cupom"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="Ex.: BEMVINDO10"
                error={couponError}
              />
              <Button variant="ghost" onClick={applyCouponCode} loading={couponLoading}>
                Aplicar
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Resumo fixo */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg space-y-3 border-t border-ink-3 bg-ink-2/95 p-4 backdrop-blur">
        <div className="space-y-1.5 text-sm">
          <Row label="Subtotal" value={formatBRL(subtotal)} />
          {discount > 0 && (
            <Row label="Desconto" value={`- ${formatBRL(discount)}`} className="text-success" />
          )}
          <Row label="Taxa de entrega" value="calculada no checkout" muted />
          <div className="flex items-center justify-between border-t border-ink-3 pt-2 text-base font-bold text-cream">
            <span>Total</span>
            <span className="font-mono">{formatBRL(subtotal - discount)}</span>
          </div>
        </div>
        {belowMin && (
          <p className="text-center text-xs text-amber">
            Pedido mínimo de {formatBRL(RESTAURANT.minOrder)}. Faltam{' '}
            {formatBRL(RESTAURANT.minOrder - subtotal)}.
          </p>
        )}
        <Button
          fullWidth
          size="lg"
          disabled={belowMin}
          onClick={() => navigate('/app/checkout')}
        >
          Ir para o pagamento
        </Button>
      </div>

      <ConfirmDialog
        open={confirmClear !== null}
        onClose={() => setConfirmClear(null)}
        onConfirm={() => {
          if (confirmClear) removeItem(confirmClear);
          setConfirmClear(null);
        }}
        title="Remover item"
        message="Tem certeza que deseja remover este item do carrinho?"
        confirmLabel="Remover"
        danger
      />
    </div>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-3 px-4">
      <button onClick={onBack} className="text-cream" aria-label="Voltar">
        <ArrowLeft size={22} />
      </button>
      <h1 className="display text-2xl text-cream">Carrinho</h1>
    </div>
  );
}

function Row({
  label,
  value,
  className,
  muted,
}: {
  label: string;
  value: string;
  className?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-cream-3">{label}</span>
      <span className={className ?? (muted ? 'text-cream-3' : 'text-cream')}>{value}</span>
    </div>
  );
}
