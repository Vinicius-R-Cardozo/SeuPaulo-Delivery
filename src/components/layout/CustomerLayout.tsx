import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, UtensilsCrossed, ReceiptText, User, MapPin, ChevronDown, ShoppingBag } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { followCustomerOrders } from '@/services/orderLive';
import { useCart } from '@/contexts/CartContext';
import { repository } from '@/services';
import type { Address } from '@/types';
import { NotificationBell } from './NotificationBell';
import { AppTabBar, useTabIndex } from './AppTabBar';
import { AppContent } from './AppContent';
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
  const tabIndex = useTabIndex(NAV);
  const [defaultAddress, setDefaultAddress] = useState<Address | null>(null);

  useEffect(() => {
    if (!profile) return;
    repository.getAddresses(profile.id).then((list) => {
      setDefaultAddress(list.find((a) => a.isDefault) ?? list[0] ?? null);
    });
  }, [profile, location.pathname]);

  const customerId = profile?.id;
  useEffect(() => {
    if (customerId) return followCustomerOrders(customerId, id => navigate('/app/pedido/' + id));
  }, [customerId, navigate]);

  const hasCheckoutFooter = /^\/app\/(carrinho|checkout)(\/|$)/.test(location.pathname);
  const hasProductFooter = /^\/app\/produto\//.test(location.pathname);
  const hideTabBar = Capacitor.isNativePlatform() && (hasCheckoutFooter || hasProductFooter);
  const showCartFab = itemCount > 0 && !hasCheckoutFooter && !hideTabBar;

  return (
    <div className={cn('app-shell', !hideTabBar && 'app-with-tabs', showCartFab && 'app-with-cart')}>
      {/* Header */}
      <header className="relative z-30 shrink-0 border-b border-ink-3 bg-ink/90 backdrop-blur">
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
      <AppContent tabIndex={tabIndex} />

      {/* Botão flutuante do carrinho */}
      {showCartFab && (
        <Link
          to="/app/carrinho"
          className="app-cart-fab animate-in absolute inset-x-4 z-40 flex items-center justify-between gap-3 rounded-xl bg-brand px-5 py-3.5 shadow-boteco"
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
      {!hideTabBar && <AppTabBar tabs={NAV} selected={tabIndex} label="Navegação do cliente" />}
    </div>
  );
}
