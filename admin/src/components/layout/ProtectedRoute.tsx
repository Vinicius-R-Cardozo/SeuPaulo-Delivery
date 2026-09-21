import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { FullScreenLoader } from '@/components/ui/Spinner';

/**
 * Guarda do painel admin: exige um usuário autenticado com papel 'admin'.
 * A autorização real é garantida pelo Supabase (RLS); aqui só controlamos a UI.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;
  if (!profile) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (profile.role !== 'admin') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink px-6">
        <div className="card max-w-sm p-8 text-center">
          <div className="text-4xl">🚫</div>
          <h1 className="display mt-3 text-xl text-cream">Acesso restrito</h1>
          <p className="mt-2 text-sm text-cream-3">
            Esta conta não tem permissão de administrador.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
