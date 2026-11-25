import { useLayoutEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Outlet, useLocation } from 'react-router-dom';
import { useScreenEntry } from '@/hooks/useScreenEntry';

export function PublicScreens() {
  const { pathname } = useLocation();
  const viewport = useRef<HTMLDivElement>(null);
  const screen = useScreenEntry<HTMLDivElement>('slide');

  useLayoutEffect(() => {
    if (Capacitor.isNativePlatform() && viewport.current) viewport.current.scrollTop = 0;
  }, [pathname]);

  return (
    <div className="app-public-viewport" ref={viewport}>
      <div ref={screen}>
        <Outlet />
      </div>
    </div>
  );
}
