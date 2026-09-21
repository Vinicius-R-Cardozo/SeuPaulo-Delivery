import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, ArrowLeft, MailCheck } from 'lucide-react';
import { AuthShell } from '@/components/layout/AuthShell';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { repository } from '@/services';
import { useToast } from '@/providers/ToastProvider';
import { validateEmail } from '@/utils/validation';

export function ForgotPassword() {
  const toast = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const err = validateEmail(email);
    setError(err);
    if (err) return;
    setLoading(true);
    try {
      await repository.requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      toast.error((err as Error).message);
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
        <Link to="/login" className="inline-flex items-center gap-1 font-semibold text-brand-2 hover:underline">
          <ArrowLeft size={14} /> Voltar ao login
        </Link>
      }
    >
      {sent ? (
        <div className="rounded-xl border border-ink-3 bg-ink-2 p-6 text-center">
          <MailCheck size={40} className="mx-auto text-success" />
          <p className="mt-3 text-sm text-cream-3">
            Se existir uma conta para <span className="font-semibold text-cream">{email}</span>,
            enviamos um link de redefinição.
          </p>
          <Button
            variant="ghost"
            fullWidth
            className="mt-5"
            onClick={() => navigate('/reset', { state: { email } })}
          >
            Já tenho o código / redefinir agora
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
          <Button type="submit" fullWidth size="lg" loading={loading}>
            Enviar link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
