import { usingSupabase } from '@/services';
import type { Role } from '@/types';

const ACCOUNTS: Record<Role, { email: string; label: string }> = {
  customer: { email: 'cliente@seupaulo.com', label: 'Cliente' },
  driver: { email: 'entregador@seupaulo.com', label: 'Entregador' },
  admin: { email: 'admin@seupaulo.com', label: 'Admin' },
};
const DEMO_PASSWORD = 'Senha123';

/**
 * Atalho de contas de demonstração (apenas no backend mock).
 * Some automaticamente quando o Supabase está configurado.
 */
export function DemoAccounts({
  onPick,
  highlight,
}: {
  onPick: (email: string, password: string) => void;
  highlight: Role;
}) {
  if (usingSupabase) return null;
  const acc = ACCOUNTS[highlight];
  return (
    <div className="mt-6 rounded-xl border border-dashed border-ink-4 bg-ink-2/50 p-4">
      <p className="text-xs font-semibold text-cream-3">
        🍺 Conta de demonstração
      </p>
      <p className="mt-1 text-xs text-cream-3/80">
        Use <span className="font-mono text-amber">{acc.email}</span> com a senha{' '}
        <span className="font-mono text-amber">{DEMO_PASSWORD}</span>.
      </p>
      <button
        type="button"
        onClick={() => onPick(acc.email, DEMO_PASSWORD)}
        className="mt-2 text-xs font-semibold text-brand-2 hover:underline"
      >
        Preencher automaticamente →
      </button>
    </div>
  );
}
