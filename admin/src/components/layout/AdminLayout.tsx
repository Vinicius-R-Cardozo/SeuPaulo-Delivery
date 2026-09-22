import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  UtensilsCrossed,
  Bike,
  UserPlus,
  Users,
  LogOut,
  Menu as MenuIcon,
  X,
} from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { NotificationBell } from './NotificationBell';
import { useAuth } from '@/contexts/AuthContext';
import { OrdersProvider } from '@/contexts/OrdersContext';
import { cn } from '@/utils/cn';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/pedidos', label: 'Pedidos', icon: ClipboardList, end: false },
  { to: '/cardapio', label: 'Cardápio', icon: UtensilsCrossed, end: false },
  { to: '/entregadores', label: 'Entregadores', icon: Bike, end: false },
  { to: '/solicitacoes', label: 'Solicitações', icon: UserPlus, end: false },
  { to: '/clientes', label: 'Clientes', icon: Users, end: false },
];

export function AdminLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Logo size="sm" />
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive ? 'bg-brand text-cream' : 'text-cream-3 hover:bg-ink-3 hover:text-cream',
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-ink-3 p-3">
        <div className="mb-2 px-2">
          <p className="truncate text-sm font-semibold text-cream">{profile?.fullName}</p>
          <p className="truncate text-xs text-cream-3">{profile?.email}</p>
        </div>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-cream-3 transition-colors hover:bg-ink-3 hover:text-cream"
        >
          <LogOut size={18} />
          Sair
        </button>
      </div>
    </div>
  );

  return (
    <OrdersProvider>
    <div className="min-h-screen bg-ink lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-ink-3 bg-ink-2 lg:block">
        {sidebar}
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/70" onClick={() => setOpen(false)} />
          <aside className="animate-in absolute left-0 top-0 h-full w-64 border-r border-ink-3 bg-ink-2">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 text-cream-3"
              aria-label="Fechar menu"
            >
              <X size={20} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-3 bg-ink/90 px-4 py-3 backdrop-blur lg:px-8">
          <button
            onClick={() => setOpen(true)}
            className="text-cream lg:hidden"
            aria-label="Abrir menu"
          >
            <MenuIcon size={22} />
          </button>
          <span className="rounded-full bg-brand/15 px-2.5 py-1 text-[11px] font-semibold text-brand-2">
            Painel administrativo
          </span>
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
    </OrdersProvider>
  );
}
