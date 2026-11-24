import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { repository } from '@/services';
import { startTracking } from '@/services/deliveryTracking';
import { Capacitor } from '@capacitor/core';
import { useMatch } from 'react-router-dom';
import { LayoutGrid, Wallet, History, User } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { NotificationBell } from './NotificationBell';
import { AppTabBar, useTabIndex } from './AppTabBar';
import { AppContent } from './AppContent';
import { cn } from '@/utils/cn';

const NAV = [
  { to: '/entregador', label: 'Painel', icon: LayoutGrid, end: true },
  { to: '/entregador/ganhos', label: 'Ganhos', icon: Wallet, end: false },
  { to: '/entregador/historico', label: 'Histórico', icon: History, end: false },
  { to: '/entregador/perfil', label: 'Perfil', icon: User, end: false },
];

export function DriverLayout() {
  const { profile } = useAuth();
  const tabIndex = useTabIndex(NAV);
  useEffect(() => {
    if (!profile) return;
    let active = true;
    const restore = async () => {
      if (document.hidden) return;
      const trips = await repository.getOrdersByDriver(profile.id);
      if (!active) return;
      const trip = trips.find(o => o.status === 'on_the_way');
      if (trip) await startTracking(trip.id);
    };
    const onResume = () => void restore().catch(() => {});
    onResume();
    document.addEventListener('visibilitychange', onResume);
    return () => { active = false; document.removeEventListener('visibilitychange', onResume); };
  }, [profile?.id]);
  const delivery = useMatch('/entregador/entrega/:id');
  const hideTabBar = Capacitor.isNativePlatform() && Boolean(delivery);

  return (
    <div className={cn('app-shell', !hideTabBar && 'app-with-tabs', 'app-driver')}>
      <header className="relative z-30 shrink-0 flex items-center justify-between border-b border-ink-3 bg-ink/90 px-4 py-3 backdrop-blur">
        <Logo size="sm" light={Capacitor.isNativePlatform()} />
        <span className="ml-auto mr-1 rounded-full bg-amber/15 px-2.5 py-1 text-[11px] font-semibold text-amber">
          Entregador
        </span>
        <NotificationBell />
      </header>

      <AppContent tabIndex={tabIndex} />

      {!hideTabBar && <AppTabBar tabs={NAV} selected={tabIndex} label="Navegação do entregador" />}
    </div>
  );
}
