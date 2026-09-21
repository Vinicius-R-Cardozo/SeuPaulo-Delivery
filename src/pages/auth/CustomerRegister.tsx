import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, User, Phone } from 'lucide-react';
import { AuthShell } from '@/components/layout/AuthShell';
import { Input } from '@/components/ui/Input';
import { PasswordField } from '@/components/ui/PasswordField';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/providers/ToastProvider';
import { formatPhone } from '@/utils/format';
import {
  validateEmail,
  validateFullName,
  validatePassword,
  validatePhone,
} from '@/utils/validation';

export function CustomerRegister() {
  const { signUp } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next = {
      fullName: validateFullName(form.fullName),
      email: validateEmail(form.email),
      phone: validatePhone(form.phone),
      password: validatePassword(form.password),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setLoading(true);
    try {
      await signUp({ ...form, role: 'customer' });
      toast.success('Conta criada! Bem-vindo ao Seu Paulo. 🍻');
      navigate('/app', { replace: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      badge="Cliente"
      title="Criar conta"
      subtitle="É rapidinho. Depois é só escolher os petiscos."
      image="/bar-mesa.jpg"
      footer={
        <>
          Já tem conta?{' '}
          <Link to="/login" className="font-semibold text-brand-2 hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label="Nome completo"
          placeholder="Maria da Silva"
          value={form.fullName}
          onChange={(e) => set('fullName')(e.target.value)}
          error={errors.fullName}
          leftIcon={<User size={16} />}
          autoComplete="name"
        />
        <Input
          label="E-mail"
          type="email"
          placeholder="voce@email.com"
          value={form.email}
          onChange={(e) => set('email')(e.target.value)}
          error={errors.email}
          leftIcon={<Mail size={16} />}
          autoComplete="email"
        />
        <Input
          label="Telefone"
          placeholder="(31) 99999-9999"
          value={form.phone}
          onChange={(e) => set('phone')(formatPhone(e.target.value))}
          error={errors.phone}
          leftIcon={<Phone size={16} />}
          inputMode="tel"
          autoComplete="tel"
        />
        <PasswordField
          label="Senha"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          showStrength
          autoComplete="new-password"
        />
        <Button type="submit" fullWidth size="lg" loading={loading}>
          Criar conta
        </Button>
      </form>
    </AuthShell>
  );
}
