import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Phone, Bike, LogOut, Save, Star, Package } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDriver } from '@/hooks/useDriver';
import { useToast } from '@/providers/ToastProvider';
import { repository } from '@/services';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/Modal';
import { DriverStatusBadge } from '@/components/ui/StatusBadge';
import { FullScreenLoader } from '@/components/ui/Spinner';
import { formatPhone } from '@/utils/format';
import { validateFullName, validatePhone } from '@/utils/validation';

const VEHICLE_LABEL = { moto: '🏍️ Moto', carro: '🚗 Carro', bicicleta: '🚲 Bicicleta' };

export function DriverProfile() {
  const { profile, setProfile, signOut } = useAuth();
  const { driver, loading } = useDriver();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: profile?.fullName ?? '',
    phone: profile?.phone ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  if (loading || !profile) return <FullScreenLoader />;

  const save = async () => {
    const next = { fullName: validateFullName(form.fullName), phone: validatePhone(form.phone) };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setSaving(true);
    try {
      const updated = await repository.updateProfile(profile.id, {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
      });
      setProfile(updated);
      toast.success('Dados atualizados!');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/entregador/login', { replace: true });
  };

  return (
    <div className="px-4 pt-4">
      <h1 className="display mb-4 text-2xl text-cream">Meu perfil</h1>

      <div className="card mb-5 p-5">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber text-xl font-bold text-ink">
            {profile.fullName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-cream">{profile.fullName}</p>
            <p className="truncate text-sm text-cream-3">{profile.email}</p>
          </div>
          {driver && <DriverStatusBadge status={driver.status} />}
        </div>
        {driver && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-ink-3 pt-4 text-center">
            <div>
              <p className="flex items-center justify-center gap-1 font-mono text-lg font-bold text-cream">
                <Star size={15} className="text-amber" /> {driver.rating.toFixed(1)}
              </p>
              <p className="text-[11px] text-cream-3">Avaliação</p>
            </div>
            <div>
              <p className="flex items-center justify-center gap-1 font-mono text-lg font-bold text-cream">
                <Package size={15} /> {driver.totalDeliveries}
              </p>
              <p className="text-[11px] text-cream-3">Entregas</p>
            </div>
          </div>
        )}
      </div>

      {/* Veículo */}
      {driver && (
        <section className="card mb-5 p-5">
          <h2 className="display mb-3 flex items-center gap-2 text-base text-cream">
            <Bike size={18} className="text-amber" /> Veículo
          </h2>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-cream-3">Tipo</span>
            <span className="text-right text-cream">{VEHICLE_LABEL[driver.vehicleType]}</span>
            <span className="text-cream-3">Modelo</span>
            <span className="text-right text-cream">{driver.model}</span>
            <span className="text-cream-3">Cor</span>
            <span className="text-right text-cream">{driver.color}</span>
            <span className="text-cream-3">Placa</span>
            <span className="text-right font-mono text-cream">{driver.plate}</span>
          </div>
        </section>
      )}

      {/* Dados pessoais */}
      <section className="card mb-5 space-y-4 p-5">
        <h2 className="display text-base text-cream">Meus dados</h2>
        <Input
          label="Nome completo"
          value={form.fullName}
          onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
          error={errors.fullName}
          leftIcon={<User size={16} />}
        />
        <Input
          label="Telefone"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: formatPhone(e.target.value) }))}
          error={errors.phone}
          leftIcon={<Phone size={16} />}
        />
        <Button onClick={save} loading={saving} leftIcon={<Save size={16} />}>
          Salvar alterações
        </Button>
      </section>

      <Button variant="ghost" fullWidth leftIcon={<LogOut size={16} />} onClick={() => setLogoutOpen(true)}>
        Sair da conta
      </Button>

      <ConfirmDialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={handleLogout}
        title="Sair da conta"
        message="Você precisará entrar novamente para receber entregas."
        confirmLabel="Sair"
        danger
      />
    </div>
  );
}
