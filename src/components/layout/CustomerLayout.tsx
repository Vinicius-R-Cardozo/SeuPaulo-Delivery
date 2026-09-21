import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, UtensilsCrossed, ReceiptText, User, MapPin, ChevronDown, ShoppingBag } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { repository } from '@/services';
import type { Address } from '@/types';
import { NotificationBell } from './NotificationBell';
import { cn } from '@/utils/cn';

const NAV = [
  { to: '/app', label: 'Início', icon: Home, end: true },
  { to: '/app/cardapio', label: 'Cardápio', icon: UtensilsCrossed, end: false },
  { to: '/app/pedidos', label: 'Pedidos', icon: ReceiptText, end: false },
  { to: '/app/perfil', label: 'Perfil', icon: User, end: false },
];

export function CustomerLayout() {
  const { profile } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [defaultAddress, setDefaultAddress] = useState<Address | null>(null);

  useEffect(() => {
    if (!profile) return;
    repository.getAddresses(profile.id).then((list) => {
      setDefaultAddress(list.find((a) => a.isDefault) ?? list[0] ?? null);
    });
  }, [profile, location.pathname]);

  const hideCartFab = location.pathname.includes('/carrinho') || location.pathname.includes('/checkout');

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col bg-ink">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-ink-3 bg-ink/90 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate('/app/enderecos')}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand-2">
              <MapPin size={18} />
            </span>
            <span className="min-w-0">
              <span className="eyebrow block text-cream-3">Entregar em</span>
              <span className="flex items-center gap-1 truncate text-sm font-semibold text-cream">
                <span className="truncate">
                  {defaultAddress
                    ? `${defaultAddress.street}, ${defaultAddress.number}`
                    : 'Adicionar endereço'}
                </span>
                <ChevronDown size={14} className="shrink-0 text-cream-3" />
              </span>
            </span>
          </button>
          <NotificationBell />
        </div>
      </header>

      {/* Conteúdo */}
      <main className="flex-1 pb-24">
        <Outlet />
      </main>

      {/* Botão flutuante do carrinho */}
      {itemCount > 0 && !hideCartFab && (
        <Link
          to="/app/carrinho"
          className="animate-in fixed inset-x-0 bottom-20 z-40 mx-auto flex max-w-lg items-center justify-between gap-3 rounded-xl bg-brand px-5 py-3.5 shadow-boteco"
          style={{ width: 'calc(100% - 2rem)' }}
        >
          <span className="flex items-center gap-2 text-cream">
            <ShoppingBag size={18} />
            <span className="font-semibold">Ver carrinho</span>
          </span>
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-cream px-2 text-sm font-bold text-brand">
            {itemCount}
          </span>
        </Link>
      )}

      {/* Bottom nav */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg border-t border-ink-3 bg-ink-2/95 backdrop-blur">
        <div className="grid grid-cols-4">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                  isActive ? 'text-brand-2' : 'text-cream-3 hover:text-cream',
                )
              }
            >
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
