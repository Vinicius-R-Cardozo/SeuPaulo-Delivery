import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, MailCheck } from 'lucide-react';
import { AuthShell } from '@/components/layout/AuthShell';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { recoveryPaths, requestPasswordRecovery, type RecoveryRole } from '@/services/passwordRecovery';
import { validateEmail } from '@/utils/validation';

export function ForgotPassword({ role = 'customer' }: { role?: RecoveryRole }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const err = validateEmail(email.trim());
    setError(err);
    if (err) return;
    setSendError('');
    setLoading(true);
    try {
      await requestPasswordRecovery(email);
      setSent(true);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Não foi possível enviar o link agora. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      badge="Recuperação"
      title={sent ? 'Confira seu e-mail' : 'Esqueceu a senha?'}
      subtitle={
        sent
          ? undefined
          : 'Informe seu e-mail e enviaremos um link para redefinir sua senha.'
      }
      footer={
        <Link to={recoveryPaths[role].login} className="inline-flex items-center gap-1 font-semibold text-brand-2 hover:underline">
          <ArrowLeft size={14} /> Voltar ao login
        </Link>
      }
    >
      {sent ? (
        <div className="rounded-xl border border-ink-3 bg-ink-2 p-6 text-center">
          <MailCheck size={40} className="mx-auto text-success" />
          <p className="mt-3 text-sm text-cream-3">
            Se houver uma conta com <span className="font-semibold text-cream">{email.trim()}</span>,
            esse endereço receberá um link para criar uma nova senha.
          </p>
          <p className="mt-3 text-sm text-cream-3">
            Abra o link no celular ou no computador. Confira também a pasta de spam.
          </p>
          <Button
            variant="ghost"
            fullWidth
            className="mt-5"
            onClick={() => setSent(false)}
          >
            Solicitar outro link
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Input
            label="E-mail"
            type="email"
            placeholder="voce@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error}
            leftIcon={<Mail size={16} />}
            autoComplete="email"
          />
          {sendError && <p role="alert" className="text-sm text-cream">{sendError}</p>}
          <Button type="submit" fullWidth size="lg" loading={loading}>
            Enviar link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
