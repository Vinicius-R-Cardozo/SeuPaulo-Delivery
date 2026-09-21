import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { Product } from '@/types';
import { formatBRL } from '@/utils/format';
import { useCart } from '@/contexts/CartContext';
import { useToast } from '@/providers/ToastProvider';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/utils/cn';

/** Card horizontal do produto (padrão de cardápio de delivery). */
export function ProductCard({ product }: { product: Product }) {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const toast = useToast();

  const needsCustomization = product.addonGroups.some((g) => g.required);

  const open = () => navigate(`/app/produto/${product.id}`);

  const quickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!product.available) return;
    if (needsCustomization) {
      open();
      return;
    }
    addItem({ product, quantity: 1, addons: [] });
    toast.success(`${product.name} adicionado 🍽️`);
  };

  return (
    <button
      onClick={open}
      disabled={!product.available}
      className={cn(
        'card flex w-full gap-3 overflow-hidden p-3 text-left transition-colors hover:border-ink-5',
        !product.available && 'opacity-60',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="font-semibold text-cream">{product.name}</h3>
          {product.popular && <Badge className="bg-amber/15 text-amber">⭐ Top</Badge>}
          {product.isNew && <Badge className="bg-success/15 text-success">Novo</Badge>}
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-cream-3">
          {product.description}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-amber">
            {formatBRL(product.price)}
          </span>
          {product.serves && <span className="text-[11px] text-cream-3">· {product.serves}</span>}
        </div>
        {!product.available && (
          <span className="mt-1 inline-block text-[11px] font-semibold text-danger">
            Indisponível no momento
          </span>
        )}
      </div>

      <div className="relative shrink-0">
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className="h-24 w-24 rounded-xl object-cover"
        />
        {product.available && (
          <span
            onClick={quickAdd}
            className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full bg-brand text-cream shadow-boteco transition-transform hover:scale-105"
            aria-label={`Adicionar ${product.name}`}
          >
            <Plus size={18} />
          </span>
        )}
      </div>
    </button>
  );
}
