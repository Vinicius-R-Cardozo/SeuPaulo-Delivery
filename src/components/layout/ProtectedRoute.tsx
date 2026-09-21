import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { FullScreenLoader } from '@/components/ui/Spinner';

const LOGIN_BY_ROLE: Record<Role, string> = {
  customer: '/login',
  driver: '/entregador/login',
  admin: '/admin/login',
};

/**
 * Guarda de rota por papel. A autorização real é garantida pelo backend
 * (RLS no Supabase); aqui apenas controlamos a navegação da UI.
 */
export function ProtectedRoute({ role, children }: { role: Role; children: ReactNode }) {
  const { profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;
  if (!profile) {
    return <Navigate to={LOGIN_BY_ROLE[role]} state={{ from: location.pathname }} replace />;
  }
  if (profile.role !== role) {
    // Usuário logado no ambiente errado → manda ao ambiente dele.
    const home = { customer: '/app', driver: '/entregador', admin: '/admin' }[profile.role];
    return <Navigate to={home} replace />;
  }
  return <>{children}</>;
}
