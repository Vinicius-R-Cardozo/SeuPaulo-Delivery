import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { AuthShell } from '@/components/layout/AuthShell';
import { Input } from '@/components/ui/Input';
import { PasswordField } from '@/components/ui/PasswordField';
import { Button } from '@/components/ui/Button';
import { repository, usingSupabase } from '@/services';
import { useToast } from '@/providers/ToastProvider';
import { validateEmail, validatePassword } from '@/utils/validation';

export function ResetPassword() {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const presetEmail = (location.state as { email?: string } | null)?.email ?? '';

  const [email, setEmail] = useState(presetEmail);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string | null> = {
      email: usingSupabase ? null : validateEmail(email),
      password: validatePassword(password),
      confirm: password !== confirm ? 'As senhas não coincidem.' : null,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setLoading(true);
    try {
      await repository.resetPassword(email, password);
      toast.success('Senha redefinida! Faça login com a nova senha.');
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      badge="Nova senha"
      title="Redefinir senha"
      subtitle="Escolha uma senha nova e forte."
      footer={
        <Link to="/login" className="font-semibold text-brand-2 hover:underline">
          Voltar ao login
        </Link>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {!usingSupabase && (
          <Input
            label="E-mail da conta"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            leftIcon={<Mail size={16} />}
            autoComplete="email"
          />
        )}
        <PasswordField
          label="Nova senha"
          value={password}
          onChange={setPassword}
          error={errors.password}
          showStrength
          autoComplete="new-password"
        />
        <PasswordField
          label="Confirmar nova senha"
          value={confirm}
          onChange={setConfirm}
          error={errors.confirm}
          autoComplete="new-password"
        />
        <Button type="submit" fullWidth size="lg" loading={loading}>
          Redefinir senha
        </Button>
      </form>
    </AuthShell>
  );
}
