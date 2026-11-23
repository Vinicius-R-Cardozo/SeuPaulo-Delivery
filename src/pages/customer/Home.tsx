import { Link, useNavigate } from 'react-router-dom';
import { Search, Flame } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMenu } from '@/hooks/useMenu';
import { ProductCard } from '@/components/menu/ProductCard';
import { ProductCardSkeleton } from '@/components/ui/Skeleton';
import { RESTAURANT } from '@/data/restaurant';

export function Home() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { sections, products, loading } = useMenu();

  const firstName = profile?.fullName.split(' ')[0] ?? '';
  const popular = products.filter((p) => p.available && p.popular).slice(0, 4);
  const novidades = products.filter((p) => p.available && p.isNew).slice(0, 4);

  return (
    <div className="space-y-7 px-4 pt-4">
      {/* Saudação */}
      <div>
        <p className="eyebrow text-cream-3">Olá, {firstName || 'boa noite'} 👋</p>
        <h1 className="display mt-1 text-2xl text-cream">O que vai ser hoje?</h1>
      </div>

      {/* Busca */}
      <button
        onClick={() => navigate('/app/cardapio')}
        className="flex w-full items-center gap-3 rounded-xl border border-ink-4 bg-ink-2 px-4 py-3 text-left text-sm text-cream-3"
      >
        <Search size={18} />
        Buscar no cardápio…
      </button>

      {/* Categorias */}
      {sections.length > 0 && <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="display text-lg text-cream">Categorias</h2>
        </div>
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
          {sections.map(({ category: c }) => (
            <button
              key={c.id}
              onClick={() => navigate(`/app/cardapio?cat=${c.slug}`)}
              className="flex min-w-[76px] flex-col items-center gap-2 rounded-xl border border-ink-3 bg-ink-2 px-3 py-3 transition-colors hover:border-ink-5"
            >
              <span className="text-2xl">{c.emoji}</span>
              <span className="text-[11px] font-medium text-cream-3">{c.name}</span>
            </button>
          ))}
        </div>
      </div>}

      {/* Destaques do cardápio */}
      {(loading || popular.length > 0) && <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="display flex items-center gap-2 text-lg text-cream">
            <Flame size={18} className="text-brand-2" /> Destaques
          </h2>
          <Link to="/app/cardapio" className="text-sm text-brand-2">
            Ver tudo
          </Link>
        </div>
        <div className="space-y-3">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => <ProductCardSkeleton key={i} />)
            : popular.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>}

      {/* Novidades */}
      {novidades.length > 0 && (
        <section>
          <h2 className="display mb-3 text-lg text-cream">Novidades</h2>
          <div className="space-y-3">
            {novidades.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      <p className="pt-2 text-center text-xs text-cream-3">
        {RESTAURANT.name} · {RESTAURANT.neighborhood}, {RESTAURANT.city}/{RESTAURANT.state}
      </p>
    </div>
  );
}
