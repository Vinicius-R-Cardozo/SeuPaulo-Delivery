import { NavLink, Outlet } from 'react-router-dom';
import { LayoutGrid, Wallet, History, User } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { NotificationBell } from './NotificationBell';
import { cn } from '@/utils/cn';

const NAV = [
  { to: '/entregador', label: 'Painel', icon: LayoutGrid, end: true },
  { to: '/entregador/ganhos', label: 'Ganhos', icon: Wallet, end: false },
  { to: '/entregador/historico', label: 'Histórico', icon: History, end: false },
  { to: '/entregador/perfil', label: 'Perfil', icon: User, end: false },
];

export function DriverLayout() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col bg-ink">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-3 bg-ink/90 px-4 py-3 backdrop-blur">
        <Logo size="sm" />
        <span className="ml-auto mr-1 rounded-full bg-amber/15 px-2.5 py-1 text-[11px] font-semibold text-amber">
          Entregador
        </span>
        <NotificationBell />
      </header>

      <main className="flex-1 pb-20">
        <Outlet />
      </main>

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
                  isActive ? 'text-amber' : 'text-cream-3 hover:text-cream',
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
