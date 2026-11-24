import { matchPath, NavLink, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
  end: boolean;
}

export function useTabIndex(tabs: Tab[]) {
  const { pathname } = useLocation();
  return tabs.findIndex(({ to: path, end }) => matchPath({ path, end }, pathname));
}

export function AppTabBar({ tabs, label, selected }: { tabs: Tab[]; label: string; selected: number }) {
  return (
    <nav aria-label={label} className="app-tab-bar">
      <div className="relative flex h-full">
        {selected >= 0 && (
          <span
            aria-hidden="true"
            className="app-tab-indicator"
            style={{ width: `${100 / tabs.length}%`, transform: `translateX(${selected * 100}%)` }}
          />
        )}
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="app-tab">
            <Icon size={24} aria-hidden="true" />
            <span className="max-w-full truncate">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
