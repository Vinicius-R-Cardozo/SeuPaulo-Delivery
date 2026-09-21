import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, User, Phone, Bike } from 'lucide-react';
import { AuthShell } from '@/components/layout/AuthShell';
import { Input } from '@/components/ui/Input';
import { PasswordField } from '@/components/ui/PasswordField';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/providers/ToastProvider';
import { formatPhone } from '@/utils/format';
import type { VehicleType } from '@/types';
import {
  validateEmail,
  validateFullName,
  validatePassword,
  validatePhone,
  validatePlate,
  validateRequired,
} from '@/utils/validation';
import { cn } from '@/utils/cn';

const VEHICLES: { value: VehicleType; label: string; emoji: string }[] = [
  { value: 'moto', label: 'Moto', emoji: '🏍️' },
  { value: 'carro', label: 'Carro', emoji: '🚗' },
  { value: 'bicicleta', label: 'Bike', emoji: '🚲' },
];

export function DriverRegister() {
  const { signUp } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    plate: '',
    model: '',
    color: '',
  });
  const [vehicleType, setVehicleType] = useState<VehicleType>('moto');
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string | null> = {
      fullName: validateFullName(form.fullName),
      email: validateEmail(form.email),
      phone: validatePhone(form.phone),
      password: validatePassword(form.password),
      model: validateRequired(form.model, 'Modelo'),
      color: validateRequired(form.color, 'Cor'),
      plate: vehicleType === 'bicicleta' ? null : validatePlate(form.plate),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setLoading(true);
    try {
      await signUp({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        password: form.password,
        role: 'driver',
        driver: {
          vehicleType,
          plate: form.plate || 'N/A',
          model: form.model,
          color: form.color,
        },
      });
      toast.success('Cadastro enviado! Aguarde a aprovação do administrador.');
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
      title="Seja um entregador"
      subtitle="Preencha seus dados e do veículo. Seu cadastro passa por aprovação."
      image="/canecas.jpg"
      footer={
        <>
          Já tem conta?{' '}
          <Link to="/entregador/login" className="font-semibold text-brand-2 hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label="Nome completo"
          value={form.fullName}
          onChange={(e) => set('fullName')(e.target.value)}
          error={errors.fullName}
          leftIcon={<User size={16} />}
        />
        <Input
          label="E-mail"
          type="email"
          value={form.email}
          onChange={(e) => set('email')(e.target.value)}
          error={errors.email}
          leftIcon={<Mail size={16} />}
        />
        <Input
          label="Telefone"
          value={form.phone}
          onChange={(e) => set('phone')(formatPhone(e.target.value))}
          error={errors.phone}
          leftIcon={<Phone size={16} />}
          inputMode="tel"
        />
        <PasswordField
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          showStrength
          autoComplete="new-password"
        />

        <div>
          <span className="label flex items-center gap-1">
            <Bike size={14} /> Tipo de veículo
          </span>
          <div className="grid grid-cols-3 gap-2">
            {VEHICLES.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => setVehicleType(v.value)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border px-3 py-3 text-sm font-medium transition-colors',
                  vehicleType === v.value
                    ? 'border-amber bg-amber/10 text-cream'
                    : 'border-ink-4 text-cream-3 hover:border-ink-5',
                )}
              >
                <span className="text-xl">{v.emoji}</span>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Marca / Modelo"
            placeholder="Honda CG 160"
            value={form.model}
            onChange={(e) => set('model')(e.target.value)}
            error={errors.model}
          />
          <Input
            label="Cor"
            placeholder="Vermelha"
            value={form.color}
            onChange={(e) => set('color')(e.target.value)}
            error={errors.color}
          />
        </div>
        {vehicleType !== 'bicicleta' && (
          <Input
            label="Placa"
            placeholder="ABC1D23"
            value={form.plate}
            onChange={(e) => set('plate')(e.target.value.toUpperCase())}
            error={errors.plate}
          />
        )}

        <Button type="submit" fullWidth size="lg" variant="amber" loading={loading}>
          Enviar cadastro
        </Button>
      </form>
    </AuthShell>
  );
}
