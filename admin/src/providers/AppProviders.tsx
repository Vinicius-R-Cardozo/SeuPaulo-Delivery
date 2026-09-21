import type { ReactNode } from 'react';
import { ToastProvider } from './ToastProvider';
import { AuthProvider } from '@/contexts/AuthContext';

/** Provedores globais do painel admin (sem carrinho — não se aplica aqui). */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>{children}</AuthProvider>
    </ToastProvider>
  );
}
