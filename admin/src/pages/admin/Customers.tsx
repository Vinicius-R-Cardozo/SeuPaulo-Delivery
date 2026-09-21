import { useEffect, useMemo, useState } from 'react';
import { Search, Mail, Phone } from 'lucide-react';
import { repository } from '@/services';
import { useOrdersFeed } from '@/contexts/OrdersContext';
import type { Profile } from '@/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatBRL, formatDate } from '@/utils/format';

export function AdminCustomers() {
  const { orders } = useOrdersFeed();
  const [customers, setCustomers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    repository.getCustomers().then((list) => {
      setCustomers(list);
      setLoading(false);
    });
  }, []);

  // Agrega pedidos e gasto total por cliente.
  const stats = useMemo(() => {
    const map: Record<string, { count: number; total: number; last?: string }> = {};
    orders
      .filter((o) => o.status !== 'cancelled')
      .forEach((o) => {
        const s = (map[o.customerId] ??= { count: 0, total: 0 });
        s.count += 1;
        s.total += o.total;
        if (!s.last || o.createdAt > s.last) s.last = o.createdAt;
      });
    return map;
  }, [orders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => c.fullName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
    );
  }, [customers, query]);

  return (
    <div>
      <h1 className="display text-3xl text-cream">Clientes</h1>

      <div className="relative mt-5 max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-cream-3" />
        <input
          className="input pl-10"
          placeholder="Buscar por nome ou e-mail…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="py-10 text-center text-cream-3">Carregando…</p>
      ) : filtered.length === 0 ? (
        <EmptyState emoji="👥" title="Nenhum cliente" description="Os clientes cadastrados aparecem aqui." />
      ) : (
        <div className="mt-5 overflow-hidden rounded-xl border border-ink-3">
          {/* Cabeçalho (desktop) */}
          <div className="hidden grid-cols-12 gap-4 border-b border-ink-3 bg-ink-2 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-cream-3 md:grid">
            <span className="col-span-4">Cliente</span>
            <span className="col-span-3">Contato</span>
            <span className="col-span-2 text-right">Pedidos</span>
            <span className="col-span-3 text-right">Total gasto</span>
          </div>
          <div className="divide-y divide-ink-3">
            {filtered.map((c) => {
              const s = stats[c.id] ?? { count: 0, total: 0 };
              return (
                <div key={c.id} className="grid grid-cols-1 gap-2 px-5 py-4 md:grid-cols-12 md:items-center md:gap-4">
                  <div className="col-span-4 flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-cream">
                      {c.fullName.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-cream">{c.fullName}</p>
                      <p className="text-xs text-cream-3">Desde {formatDate(c.createdAt)}</p>
                    </div>
                  </div>
                  <div className="col-span-3 space-y-0.5 text-xs text-cream-3">
                    <p className="flex items-center gap-1.5">
                      <Mail size={12} /> {c.email}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Phone size={12} /> {c.phone}
                    </p>
                  </div>
                  <div className="col-span-2 md:text-right">
                    <span className="font-mono text-cream">{s.count}</span>{' '}
                    <span className="text-xs text-cream-3 md:hidden">pedidos</span>
                  </div>
                  <div className="col-span-3 md:text-right">
                    <span className="font-mono font-semibold text-amber">{formatBRL(s.total)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
