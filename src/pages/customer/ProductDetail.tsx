import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import type { AddonGroup, Product, SelectedAddon } from '@/types';
import { repository } from '@/services';
import { useCart } from '@/contexts/CartContext';
import { useToast } from '@/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { FullScreenLoader } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatBRL } from '@/utils/format';
import { cn } from '@/utils/cn';

/** seleção por grupo: single guarda 1 id; multiple guarda vários. */
type Selections = Record<string, string[]>;

export function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const toast = useToast();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selections, setSelections] = useState<Selections>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    let active = true;
    repository.getProduct(id!).then((p) => {
      if (!active) return;
      setProduct(p);
      // Pré-seleciona a 1ª opção de grupos single obrigatórios.
      const initial: Selections = {};
      p?.addonGroups.forEach((g) => {
        if (g.type === 'single' && g.required && g.options[0]) initial[g.id] = [g.options[0].id];
        else initial[g.id] = [];
      });
      setSelections(initial);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [id]);

  const toggle = (group: AddonGroup, optionId: string) => {
    setSelections((prev) => {
      const current = prev[group.id] ?? [];
      if (group.type === 'single') return { ...prev, [group.id]: [optionId] };
      const has = current.includes(optionId);
      if (has) return { ...prev, [group.id]: current.filter((x) => x !== optionId) };
      if (current.length >= group.max) return prev; // respeita o máximo
      return { ...prev, [group.id]: [...current, optionId] };
    });
  };

  const selectedAddons: SelectedAddon[] = useMemo(() => {
    if (!product) return [];
    const out: SelectedAddon[] = [];
    product.addonGroups.forEach((g) => {
      (selections[g.id] ?? []).forEach((optId) => {
        const opt = g.options.find((o) => o.id === optId);
        if (opt) out.push({ groupId: g.id, groupName: g.name, optionId: opt.id, optionName: opt.name, price: opt.price });
      });
    });
    return out;
  }, [product, selections]);

  const unitPrice = (product?.price ?? 0) + selectedAddons.reduce((s, a) => s + a.price, 0);
  const total = unitPrice * quantity;

  const missing = useMemo(() => {
    if (!product) return [];
    return product.addonGroups.filter((g) => {
      const count = (selections[g.id] ?? []).length;
      if (g.required && count < Math.max(1, g.min)) return true;
      if (count < g.min) return true;
      return false;
    });
  }, [product, selections]);

  const add = () => {
    if (!product) return;
    if (missing.length > 0) {
      toast.error(`Escolha: ${missing.map((g) => g.name).join(', ')}`);
      return;
    }
    addItem({ product, quantity, addons: selectedAddons, notes: notes.trim() || undefined });
    toast.success(`${product.name} adicionado ao carrinho 🛒`);
    navigate(-1);
  };

  if (loading) return <FullScreenLoader />;
  if (!product)
    return (
      <EmptyState
        emoji="🤔"
        title="Produto não encontrado"
        action={<Button onClick={() => navigate('/app/cardapio')}>Ver cardápio</Button>}
      />
    );

  return (
    <div className="pb-32">
      {/* Imagem + voltar */}
      <div className="relative">
        <img src={product.image} alt={product.name} className="h-60 w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink to-transparent" />
        <button
          onClick={() => navigate(-1)}
          className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-ink/70 text-cream backdrop-blur"
          aria-label="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
      </div>

      <div className="space-y-6 px-4 pt-4">
        <div>
          <h1 className="display text-2xl text-cream">{product.name}</h1>
          <p className="mt-2 text-sm leading-relaxed text-cream-3">{product.description}</p>
          <p className="mt-3 font-mono text-lg font-semibold text-amber">
            {formatBRL(product.price)}
          </p>
          {product.serves && <p className="text-xs text-cream-3">{product.serves}</p>}
        </div>

        {/* Grupos de personalização */}
        {product.addonGroups.map((group) => (
          <section key={group.id}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold text-cream">{group.name}</h2>
              <span className="text-[11px] font-medium text-cream-3">
                {group.required ? 'Obrigatório' : group.type === 'multiple' ? `Até ${group.max}` : 'Opcional'}
              </span>
            </div>
            <div className="space-y-2">
              {group.options.map((opt) => {
                const checked = (selections[group.id] ?? []).includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => toggle(group, opt.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors',
                      checked ? 'border-brand bg-brand/10' : 'border-ink-4 hover:border-ink-5',
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={cn(
                          'flex h-5 w-5 items-center justify-center border transition-colors',
                          group.type === 'single' ? 'rounded-full' : 'rounded-md',
                          checked ? 'border-brand bg-brand text-cream' : 'border-ink-5',
                        )}
                      >
                        {checked && <Check size={13} />}
                      </span>
                      <span className="text-sm text-cream">{opt.name}</span>
                    </span>
                    {opt.price > 0 && (
                      <span className="font-mono text-xs text-amber">+ {formatBRL(opt.price)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        {/* Observações */}
        <section>
          <h2 className="mb-2 font-semibold text-cream">Alguma observação?</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={140}
            rows={3}
            placeholder="Ex.: Sem cebola, capricha no molho…"
            className="input resize-none"
          />
          <p className="mt-1 text-right text-[11px] text-cream-3">{notes.length}/140</p>
        </section>

        {/* Quantidade */}
        <div className="flex items-center justify-between">
          <span className="font-semibold text-cream">Quantidade</span>
          <QuantityStepper value={quantity} onChange={setQuantity} />
        </div>
      </div>

      {/* Barra fixa de adicionar */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg border-t border-ink-3 bg-ink-2/95 p-4 backdrop-blur">
        <Button fullWidth size="lg" onClick={add} disabled={!product.available}>
          Adicionar · {formatBRL(total)}
        </Button>
      </div>
    </div>
  );
}
