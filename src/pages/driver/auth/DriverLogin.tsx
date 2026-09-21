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

export function DriverLogin() {
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
      await signIn(email, password, 'driver');
      navigate('/entregador', { replace: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      badge="Entregador"
      title="Área do entregador"
      subtitle="Entre para receber e gerenciar suas entregas."
      image="/canecas.jpg"
      footer={
        <>
          Quer ser entregador?{' '}
          <Link to="/entregador/cadastro" className="font-semibold text-brand-2 hover:underline">
            Cadastre-se
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label="E-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          leftIcon={<Mail size={16} />}
          autoComplete="email"
        />
        <PasswordField value={password} onChange={setPassword} error={errors.password} />
        <Button type="submit" fullWidth size="lg" variant="amber" loading={loading}>
          Entrar
        </Button>
      </form>
      <DemoAccounts onPick={(e, p) => { setEmail(e); setPassword(p); }} highlight="driver" />
      <div className="mt-6 text-center text-xs text-cream-3">
        <Link to="/login" className="hover:text-cream">
          Sou cliente
        </Link>
      </div>
    </AuthShell>
  );
}
