import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { repository } from '@/services';
import { useToast } from '@/providers/ToastProvider';
import type { Category, CategorySlug, Product } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { formatBRL } from '@/utils/format';
import { uid } from '@/utils/id';
import { cn } from '@/utils/cn';

const IMAGE_PRESETS = [
  '/menu-comidas.jpg',
  '/prato.jpg',
  '/menu-caipirinhas.jpg',
  '/canecas.jpg',
  '/bar-mesa.jpg',
];

export function MenuManager() {
  const toast = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    Promise.all([repository.getCategories(), repository.getProducts()]).then(([c, p]) => {
      setCategories(c.filter((x) => x.slug !== 'mais-pedidos'));
      setProducts(p);
      setLoading(false);
    });
  };
  useEffect(load, []);

  const byCategory = useMemo(() => {
    const map: Record<string, Product[]> = {};
    products.forEach((p) => {
      (map[p.categorySlug] ??= []).push(p);
    });
    return map;
  }, [products]);

  const toggleAvailability = async (p: Product) => {
    await repository.setProductAvailability(p.id, !p.available);
    load();
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await repository.deleteProduct(toDelete.id);
      toast.success('Produto removido.');
      setToDelete(null);
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="display text-3xl text-cream">Cardápio</h1>
        <Button leftIcon={<Plus size={18} />} onClick={() => setCreating(true)}>
          Novo produto
        </Button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-cream-3">Carregando…</p>
      ) : (
        <div className="mt-6 space-y-8">
          {categories.map((c) => {
            const items = byCategory[c.slug] ?? [];
            if (items.length === 0) return null;
            return (
              <section key={c.id}>
                <h2 className="display mb-3 flex items-center gap-2 text-lg text-cream">
                  <span>{c.emoji}</span> {c.name}
                  <span className="text-sm font-normal text-cream-3">({items.length})</span>
                </h2>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((p) => (
                    <div key={p.id} className={cn('card flex gap-3 p-3', !p.available && 'opacity-60')}>
                      <img src={p.image} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-cream">{p.name}</p>
                        <p className="font-mono text-sm text-amber">{formatBRL(p.price)}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-cream-3">{p.description}</p>
                        <div className="mt-2 flex gap-1">
                          <IconBtn label={p.available ? 'Tornar indisponível' : 'Tornar disponível'} onClick={() => toggleAvailability(p)}>
                            {p.available ? <Eye size={15} /> : <EyeOff size={15} />}
                          </IconBtn>
                          <IconBtn label="Editar" onClick={() => setEditing(p)}>
                            <Pencil size={15} />
                          </IconBtn>
                          <IconBtn label="Excluir" danger onClick={() => setToDelete(p)}>
                            <Trash2 size={15} />
                          </IconBtn>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <ProductEditor
          initial={editing}
          categories={categories}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            load();
            toast.success('Produto salvo!');
          }}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Remover produto"
        message={`Remover "${toDelete?.name}" do cardápio?`}
        confirmLabel="Remover"
        danger
        loading={busy}
      />
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  label,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-lg border border-ink-4 text-cream-3 transition-colors',
        danger ? 'hover:border-danger hover:text-danger' : 'hover:border-brand-2 hover:text-cream',
      )}
    >
      {children}
    </button>
  );
}

function ProductEditor({
  initial,
  categories,
  onClose,
  onSaved,
}: {
  initial: Product | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    price: initial ? String(initial.price) : '',
    categorySlug: initial?.categorySlug ?? categories[0]?.slug ?? 'petiscos',
    image: initial?.image ?? IMAGE_PRESETS[0],
    serves: initial?.serves ?? '',
    popular: initial?.popular ?? false,
    isNew: initial?.isNew ?? false,
    available: initial?.available ?? true,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const price = Number(form.price.replace(',', '.'));
    if (!form.name.trim() || !Number.isFinite(price) || price <= 0) {
      toast.error('Informe nome e um preço válido.');
      return;
    }
    setSaving(true);
    try {
      const product: Product = {
        id: initial?.id ?? uid('p'),
        categorySlug: form.categorySlug as CategorySlug,
        name: form.name.trim(),
        description: form.description.trim(),
        price,
        image: form.image,
        available: form.available,
        serves: form.serves.trim() || undefined,
        popular: form.popular,
        isNew: form.isNew,
        tags: initial?.tags ?? [],
        addonGroups: initial?.addonGroups ?? [],
      };
      await repository.upsertProduct(product);
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? 'Editar produto' : 'Novo produto'}
      footer={
        <Button fullWidth onClick={save} loading={saving}>
          Salvar produto
        </Button>
      }
    >
      <div className="space-y-4">
        <Input label="Nome" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <div>
          <label className="label">Descrição</label>
          <textarea
            className="input resize-none"
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Preço (R$)"
            inputMode="decimal"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
          />
          <div>
            <label className="label">Categoria</label>
            <select
              className="input"
              value={form.categorySlug}
              onChange={(e) => setForm((f) => ({ ...f, categorySlug: e.target.value as CategorySlug }))}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Input
          label="Porção serve (opcional)"
          placeholder="Ex.: Serve 2"
          value={form.serves}
          onChange={(e) => setForm((f) => ({ ...f, serves: e.target.value }))}
        />

        {/* Imagem */}
        <div>
          <label className="label">Imagem</label>
          <div className="flex gap-2">
            {IMAGE_PRESETS.map((img) => (
              <button
                key={img}
                onClick={() => setForm((f) => ({ ...f, image: img }))}
                className={cn(
                  'h-14 w-14 overflow-hidden rounded-lg border-2',
                  form.image === img ? 'border-brand' : 'border-transparent',
                )}
              >
                <img src={img} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* Flags */}
        <div className="flex flex-wrap gap-4">
          <Toggle label="Disponível" checked={form.available} onChange={(v) => setForm((f) => ({ ...f, available: v }))} />
          <Toggle label="⭐ Popular" checked={form.popular} onChange={(v) => setForm((f) => ({ ...f, popular: v }))} />
          <Toggle label="Novidade" checked={form.isNew} onChange={(v) => setForm((f) => ({ ...f, isNew: v }))} />
        </div>
      </div>
    </Modal>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-cream">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-brand" />
      {label}
    </label>
  );
}
