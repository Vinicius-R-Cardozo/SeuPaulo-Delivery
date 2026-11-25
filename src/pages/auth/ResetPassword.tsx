import { Link } from 'react-router-dom';
import { AuthShell } from '@/components/layout/AuthShell';
import { recoveryPaths, type RecoveryRole } from '@/services/passwordRecovery';

export function ResetPassword({ role }: { role: RecoveryRole }) {
  const paths = recoveryPaths[role];

  return (
    <AuthShell
      title="Use o link do e-mail"
      badge="Recuperação"
      subtitle="Abra o link que enviamos para definir uma nova senha. Se ele expirou ou já foi usado, solicite outro."
      footer={<Link to={paths.login} className="font-semibold text-brand-2 hover:underline">Voltar ao login</Link>}
    >
      <Link to={paths.request} replace className="btn btn-primary w-full">Solicitar novo link</Link>
    </AuthShell>
  );
}
