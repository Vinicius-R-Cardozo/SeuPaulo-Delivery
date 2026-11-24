import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { useMenu } from '@/hooks/useMenu';
import { ProductCard } from '@/components/menu/ProductCard';
import { ProductCardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import type { CategorySlug } from '@/types';
import { cn } from '@/utils/cn';

export function Menu() {
  const { sections, loading, error } = useMenu();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const selected = sections.find(({ category }) => category.slug === params.get('cat'));
  const active = selected?.category.slug ?? 'todos';
  const visibleSections = selected ? [selected] : sections;
  const search = query.trim().toLowerCase();
  const filtered = search
    ? visibleSections.flatMap(({ items }) =>
        items.filter((p) => p.name.toLowerCase().includes(search) || p.description.toLowerCase().includes(search)),
      )
    : [];

  const goToCat = (slug: CategorySlug | 'todos') => {
    setParams(slug === 'todos' ? {} : { cat: slug });
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
      {sections.length > 0 && (
        <div className="no-scrollbar sticky top-0 z-20 mt-3 flex gap-2 overflow-x-auto border-b border-ink-3 bg-ink/90 px-4 py-2.5 backdrop-blur">
          <Chip active={active === 'todos'} onClick={() => goToCat('todos')}>
            Todos
          </Chip>
          {sections.map(({ category }) => (
            <Chip key={category.id} active={active === category.slug} onClick={() => goToCat(category.slug)}>
              {category.emoji} {category.name}
            </Chip>
          ))}
        </div>
      )}

      <div className="space-y-8 px-4 py-5">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)
        ) : error ? (
          <EmptyState
            title="Não foi possível carregar o cardápio"
            action={<Button onClick={() => window.location.reload()}>Tentar novamente</Button>}
          />
        ) : sections.length === 0 ? (
          <EmptyState title="Cardápio indisponível" description="Ainda não há itens disponíveis para pedir." />
        ) : search ? (
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
          visibleSections.map(({ category, items }) => (
            <section key={category.id}>
              <h2 className="display mb-3 flex items-center gap-2 text-lg text-cream">
                <span>{category.emoji}</span> {category.name}
              </h2>
              <div className="space-y-3">
                {items.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </section>
          ))
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
      aria-pressed={active}
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
