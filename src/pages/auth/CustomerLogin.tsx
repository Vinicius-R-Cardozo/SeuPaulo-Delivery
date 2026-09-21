import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { AuthShell } from '@/components/layout/AuthShell';
import { Input } from '@/components/ui/Input';
import { PasswordField } from '@/components/ui/PasswordField';
import { Button } from '@/components/ui/Button';
import { DemoAccounts } from '@/components/layout/DemoAccounts';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/providers/ToastProvider';
import { validateEmail } from '@/utils/validation';

export function CustomerLogin() {
  const { signIn } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const emailErr = validateEmail(email);
    const passErr = password ? null : 'Informe sua senha.';
    setErrors({ email: emailErr, password: passErr });
    if (emailErr || passErr) return;
    setLoading(true);
    try {
      await signIn(email, password, 'customer');
      navigate('/app', { replace: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (e: string, p: string) => {
    setEmail(e);
    setPassword(p);
  };

  return (
    <AuthShell
      badge="Cliente"
      title="Bem-vindo de volta"
      subtitle="Entre para pedir seu petisco favorito."
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link to="/cadastro" className="font-semibold text-brand-2 hover:underline">
            Cadastre-se
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label="E-mail"
          type="email"
          placeholder="voce@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          leftIcon={<Mail size={16} />}
          autoComplete="email"
        />
        <PasswordField value={password} onChange={setPassword} error={errors.password} />
        <div className="text-right">
          <Link to="/recuperar-senha" className="text-sm text-cream-3 hover:text-cream">
            Esqueci minha senha
          </Link>
        </div>
        <Button type="submit" fullWidth size="lg" loading={loading}>
          Entrar
        </Button>
      </form>

      <DemoAccounts onPick={fillDemo} highlight="customer" />

      <div className="mt-6 flex items-center justify-center gap-4 text-xs text-cream-3">
        <Link to="/entregador/login" className="hover:text-cream">
          Sou entregador
        </Link>
        <span aria-hidden>•</span>
        <Link to="/admin/login" className="hover:text-cream">
          Painel administrativo
        </Link>
      </div>
    </AuthShell>
  );
}
