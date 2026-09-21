import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { useMenu } from '@/hooks/useMenu';
import { ProductCard } from '@/components/menu/ProductCard';
import { ProductCardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import type { CategorySlug } from '@/types';
import { cn } from '@/utils/cn';

export function Menu() {
  const { categories, products, loading } = useMenu();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<CategorySlug | 'todos'>('todos');
  const sectionsRef = useRef<Record<string, HTMLElement | null>>({});

  const initialCat = params.get('cat') as CategorySlug | null;

  useEffect(() => {
    if (initialCat) {
      setActive(initialCat);
      const el = sectionsRef.current[initialCat];
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCat, loading]);

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.slug !== 'mais-pedidos'),
    [categories],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
    );
  }, [products, query]);

  const goToCat = (slug: CategorySlug | 'todos') => {
    setActive(slug);
    setParams(slug === 'todos' ? {} : { cat: slug });
    const el = sectionsRef.current[slug];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="pt-4">
      <div className="px-4">
        <h1 className="display text-2xl text-cream">Cardápio</h1>
        <div className="relative mt-3">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-cream-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar petiscos, porções, drinks…"
            className="input pl-10 pr-10"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-cream-3 hover:text-cream"
              aria-label="Limpar busca"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Abas de categoria */}
      {!query && (
        <div className="no-scrollbar sticky top-[57px] z-20 mt-3 flex gap-2 overflow-x-auto border-b border-ink-3 bg-ink/90 px-4 py-2.5 backdrop-blur">
          <Chip active={active === 'todos'} onClick={() => goToCat('todos')}>
            Todos
          </Chip>
          {visibleCategories.map((c) => (
            <Chip key={c.id} active={active === c.slug} onClick={() => goToCat(c.slug)}>
              {c.emoji} {c.name}
            </Chip>
          ))}
        </div>
      )}

      <div className="space-y-8 px-4 py-5">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)
        ) : query ? (
          filtered.length === 0 ? (
            <EmptyState emoji="🔎" title="Nada encontrado" description={`Sem resultados para "${query}".`} />
          ) : (
            <div className="space-y-3">
              {filtered.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )
        ) : (
          visibleCategories.map((c) => {
            const items = products.filter((p) => p.categorySlug === c.slug);
            if (items.length === 0) return null;
            return (
              <section
                key={c.id}
                ref={(el) => {
                  sectionsRef.current[c.slug] = el;
                }}
                className="scroll-mt-32"
              >
                <h2 className="display mb-3 flex items-center gap-2 text-lg text-cream">
                  <span>{c.emoji}</span> {c.name}
                </h2>
                <div className="space-y-3">
                  {items.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-brand bg-brand text-cream'
          : 'border-ink-4 text-cream-3 hover:border-ink-5',
      )}
    >
      {children}
    </button>
  );
}
