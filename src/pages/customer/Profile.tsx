import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Mail,
  Phone,
  MapPin,
  ReceiptText,
  TicketPercent,
  KeyRound,
  LogOut,
  ChevronRight,
  Save,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/providers/ToastProvider';
import { repository } from '@/services';
import type { Coupon } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PasswordField } from '@/components/ui/PasswordField';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Logo } from '@/components/ui/Logo';
import { formatPhone } from '@/utils/format';
import { validateFullName, validatePassword, validatePhone } from '@/utils/validation';

export function Profile() {
  const { profile, setProfile, signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: profile?.fullName ?? '',
    phone: profile?.phone ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [couponsOpen, setCouponsOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  if (!profile) return null;

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
    navigate('/login', { replace: true });
  };

  return (
    <div className="px-4 pt-4">
      <h1 className="display mb-4 text-2xl text-cream">Perfil</h1>

      {/* Cartão do usuário */}
      <div className="card mb-5 flex items-center gap-4 p-5">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-xl font-bold text-cream">
          {profile.fullName.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-cream">{profile.fullName}</p>
          <p className="truncate text-sm text-cream-3">{profile.email}</p>
        </div>
      </div>

      {/* Editar dados */}
      <section className="card mb-5 space-y-4 p-5">
        <h2 className="display text-base text-cream">Meus dados</h2>
        <Input
          label="Nome completo"
          value={form.fullName}
          onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
          error={errors.fullName}
          leftIcon={<User size={16} />}
        />
        <Input label="E-mail" value={profile.email} disabled leftIcon={<Mail size={16} />} />
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

      {/* Atalhos */}
      <section className="card mb-5 divide-y divide-ink-3 overflow-hidden">
        <MenuRow icon={<MapPin size={18} />} label="Meus endereços" onClick={() => navigate('/app/enderecos')} />
        <MenuRow icon={<ReceiptText size={18} />} label="Meus pedidos" onClick={() => navigate('/app/pedidos')} />
        <MenuRow icon={<TicketPercent size={18} />} label="Cupons" onClick={() => setCouponsOpen(true)} />
        <MenuRow icon={<KeyRound size={18} />} label="Alterar senha" onClick={() => setPwOpen(true)} />
      </section>

      <Button variant="ghost" fullWidth leftIcon={<LogOut size={16} />} onClick={() => setLogoutOpen(true)}>
        Sair da conta
      </Button>

      <div className="mt-8 flex flex-col items-center gap-1 pb-4 text-center">
        <Logo size="sm" withText={false} />
        <p className="text-[11px] text-cream-3">Seu Paulo Delivery · v1.0</p>
      </div>

      {pwOpen && <ChangePasswordModal userId={profile.id} onClose={() => setPwOpen(false)} />}
      {couponsOpen && <CouponsModal onClose={() => setCouponsOpen(false)} />}

      <ConfirmDialog
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={handleLogout}
        title="Sair da conta"
        message="Você precisará entrar novamente para fazer pedidos."
        confirmLabel="Sair"
        danger
      />
    </div>
  );
}

function MenuRow({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-ink-3"
    >
      <span className="text-brand-2">{icon}</span>
      <span className="flex-1 text-sm font-medium text-cream">{label}</span>
      <ChevronRight size={16} className="text-cream-3" />
    </button>
  );
}

function ChangePasswordModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const e: Record<string, string | null> = {
      next: validatePassword(next),
      confirm: next !== confirm ? 'As senhas não coincidem.' : null,
    };
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setLoading(true);
    try {
      await repository.changePassword(userId, current, next);
      toast.success('Senha alterada com sucesso!');
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Alterar senha"
      footer={
        <Button fullWidth onClick={submit} loading={loading}>
          Salvar nova senha
        </Button>
      }
    >
      <div className="space-y-4">
        <PasswordField label="Senha atual" value={current} onChange={setCurrent} />
        <PasswordField
          label="Nova senha"
          value={next}
          onChange={setNext}
          error={errors.next}
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
      </div>
    </Modal>
  );
}

function CouponsModal({ onClose }: { onClose: () => void }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const toast = useToast();

  useEffect(() => {
    repository.getCoupons().then((list) => setCoupons(list.filter((c) => c.active)));
  }, []);

  return (
    <Modal open onClose={onClose} title="Cupons disponíveis">
      <div className="space-y-3">
        {coupons.length === 0 ? (
          <p className="text-sm text-cream-3">Nenhum cupom ativo no momento.</p>
        ) : (
          coupons.map((c) => (
            <div
              key={c.code}
              className="flex items-center justify-between rounded-xl border border-dashed border-amber/40 bg-amber/5 p-4"
            >
              <div>
                <p className="font-mono text-sm font-bold text-amber">{c.code}</p>
                <p className="text-xs text-cream-3">{c.description}</p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(c.code);
                  toast.success('Cupom copiado!');
                }}
                className="text-xs font-semibold text-brand-2 hover:underline"
              >
                Copiar
              </button>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
