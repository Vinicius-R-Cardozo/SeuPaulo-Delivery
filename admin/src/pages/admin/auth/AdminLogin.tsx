import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ShieldCheck } from 'lucide-react';
import { AuthShell } from '@/components/layout/AuthShell';
import { Input } from '@/components/ui/Input';
import { PasswordField } from '@/components/ui/PasswordField';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/providers/ToastProvider';
import { validateEmail } from '@/utils/validation';

export function AdminLogin() {
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
      await signIn(email, password, 'admin');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      badge="Administrador"
      title="Painel do Seu Paulo"
      subtitle="Acesso restrito à administração da casa."
      image="/prato.jpg"
      footer={
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-success" /> Acesso protegido por permissões
        </span>
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
        <Button type="submit" fullWidth size="lg" loading={loading}>
          Entrar no painel
        </Button>
      </form>
    </AuthShell>
  );
}
