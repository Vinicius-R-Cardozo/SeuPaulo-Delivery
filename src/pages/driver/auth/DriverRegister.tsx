import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  User,
  Mail,
  Phone,
  IdCard,
  Calendar,
  MapPin,
  ArrowLeft,
  ArrowRight,
  Bike,
  ShieldCheck,
  Sun,
  Glasses,
  ScanFace,
  Pencil,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { AuthShell } from '@/components/layout/AuthShell';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { PasswordField } from '@/components/ui/PasswordField';
import { Stepper } from '@/components/onboarding/Stepper';
import { PhotoCapture } from '@/components/onboarding/PhotoCapture';
import type { CapturedMedia } from '@/components/onboarding/capture';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/providers/ToastProvider';
import type { DeliveryVehicle, DocumentKind } from '@/types';
import {
  formatCEP,
  formatCPF,
  formatDateInput,
  formatDigits,
  formatPhone,
  formatPlate,
} from '@/utils/format';
import {
  validateBirthDate,
  validateCEP,
  validateCnhExpiry,
  validateCnhNumber,
  validateCPF,
  validateEmail,
  validateFullName,
  validateMotoCategory,
  validatePassword,
  validatePhone,
  validatePlate,
  validateRenavam,
  validateRG,
  validateRequired,
  validateYear,
} from '@/utils/validation';
import { lookupCep } from '@/utils/cep';
import { cn } from '@/utils/cn';

type Errors = Record<string, string | null>;

const STEPS_BIKE = ['Tipo', 'Dados', 'Endereço', 'Identidade', 'Bicicleta', 'Revisão'];
const STEPS_MOTO = ['Tipo', 'Dados', 'Endereço', 'Identidade', 'CNH', 'Moto', 'Revisão'];

const CNH_CATEGORIES = ['A', 'AB', 'AC', 'AD', 'AE'].map((c) => ({ value: c, label: c }));

export function DriverRegister() {
  const { setProfile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [vehicle, setVehicle] = useState<DeliveryVehicle | null>(null);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  const [f, setF] = useState({
    fullName: '',
    cpf: '',
    rg: '',
    birthDate: '',
    email: '',
    phone: '',
    password: '',
    zip: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    cnhNumber: '',
    cnhCategory: 'AB',
    cnhExpiry: '',
    motoBrand: '',
    motoModel: '',
    motoYear: '',
    motoColor: '',
    motoPlate: '',
    motoRenavam: '',
    bikeKind: 'convencional' as 'convencional' | 'eletrica',
    bikeBrand: '',
    bikeModel: '',
    bikeColor: '',
  });
  const [docs, setDocs] = useState<Partial<Record<DocumentKind, CapturedMedia>>>({});

  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const setDoc = (kind: DocumentKind) => (m: CapturedMedia) =>
    setDocs((d) => ({ ...d, [kind]: m }));

  const steps = vehicle === 'moto' ? STEPS_MOTO : STEPS_BIKE;
  const label = steps[step];

  /* --------------------------- Autofill de CEP --------------------------- */
  const onZip = async (raw: string) => {
    const masked = formatCEP(raw);
    set('zip')(masked);
    const digits = masked.replace(/\D/g, '');
    if (digits.length === 8) {
      setCepLoading(true);
      const res = await lookupCep(digits);
      setCepLoading(false);
      if (res) {
        setF((s) => ({
          ...s,
          street: res.street || s.street,
          neighborhood: res.neighborhood || s.neighborhood,
          city: res.city || s.city,
          state: res.state || s.state,
        }));
      }
    }
  };

  /* ----------------------------- Validação ------------------------------- */
  function validate(current: string): Errors {
    const e: Errors = {};
    if (current === 'Tipo') {
      if (!vehicle) e.vehicle = 'Escolha como você vai entregar.';
    }
    if (current === 'Dados') {
      e.fullName = validateFullName(f.fullName);
      e.cpf = validateCPF(f.cpf);
      e.rg = validateRG(f.rg);
      e.birthDate = validateBirthDate(f.birthDate);
      e.email = validateEmail(f.email);
      e.phone = validatePhone(f.phone);
      e.password = validatePassword(f.password);
    }
    if (current === 'Endereço') {
      e.zip = validateCEP(f.zip);
      e.street = validateRequired(f.street, 'Rua');
      e.number = validateRequired(f.number, 'Número');
      e.neighborhood = validateRequired(f.neighborhood, 'Bairro');
      e.city = validateRequired(f.city, 'Cidade');
      e.state = validateRequired(f.state, 'Estado');
    }
    if (current === 'Identidade') {
      if (!docs.selfie) e.selfie = 'Faça sua selfie.';
      if (!docs.id_document) e.id_document = 'Envie seu documento de identificação.';
    }
    if (current === 'CNH') {
      e.cnhNumber = validateCnhNumber(f.cnhNumber);
      e.cnhCategory = validateMotoCategory(f.cnhCategory);
      e.cnhExpiry = validateCnhExpiry(f.cnhExpiry);
      if (!docs.cnh_front) e.cnh_front = 'Envie a frente da CNH.';
      if (!docs.cnh_back) e.cnh_back = 'Envie o verso da CNH.';
    }
    if (current === 'Moto') {
      e.motoBrand = validateRequired(f.motoBrand, 'Marca');
      e.motoModel = validateRequired(f.motoModel, 'Modelo');
      e.motoYear = validateYear(f.motoYear);
      e.motoColor = validateRequired(f.motoColor, 'Cor');
      e.motoPlate = validatePlate(f.motoPlate);
      e.motoRenavam = validateRenavam(f.motoRenavam);
      if (!docs.vehicle_doc) e.vehicle_doc = 'Envie o documento do veículo.';
      if (!docs.vehicle_photo) e.vehicle_photo = 'Envie a foto da moto.';
      if (!docs.plate_photo) e.plate_photo = 'Envie a foto da placa.';
    }
    if (current === 'Bicicleta') {
      e.bikeColor = validateRequired(f.bikeColor, 'Cor');
      if (!docs.bike_photo) e.bike_photo = 'Envie a foto da bicicleta.';
    }
    return e;
  }

  const next = () => {
    const e = validate(label);
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };
  const back = () => {
    if (step === 0) {
      navigate('/entregador/login');
      return;
    }
    setErrors({});
    setStep((s) => s - 1);
  };
  const goTo = (i: number) => {
    setErrors({});
    setStep(i);
  };

  /* ------------------------------- Envio --------------------------------- */
  const submit = async () => {
    if (!vehicle) return;
    // Revalida tudo antes de enviar.
    const allSteps = vehicle === 'moto' ? STEPS_MOTO : STEPS_BIKE;
    for (const s of allSteps) {
      const e = validate(s);
      if (Object.values(e).some(Boolean)) {
        setErrors(e);
        setStep(allSteps.indexOf(s));
        toast.error('Revise os campos destacados antes de enviar.');
        return;
      }
    }
    setLoading(true);
    try {
      const { repository } = await import('@/services');
      const documents = Object.values(docs).filter(Boolean) as CapturedMedia[];
      const { profile } = await repository.registerDriver({
        password: f.password,
        vehicle,
        fullName: f.fullName,
        cpf: f.cpf,
        rg: f.rg,
        birthDate: f.birthDate,
        email: f.email,
        phone: f.phone,
        address: {
          zip: f.zip,
          street: f.street,
          number: f.number,
          complement: f.complement || undefined,
          neighborhood: f.neighborhood,
          city: f.city,
          state: f.state.toUpperCase(),
        },
        cnh:
          vehicle === 'moto'
            ? { number: f.cnhNumber, category: f.cnhCategory, expiresAt: f.cnhExpiry }
            : null,
        moto:
          vehicle === 'moto'
            ? {
                brand: f.motoBrand,
                model: f.motoModel,
                year: f.motoYear,
                color: f.motoColor,
                plate: formatPlate(f.motoPlate),
                renavam: f.motoRenavam || undefined,
              }
            : null,
        bike:
          vehicle === 'bicicleta'
            ? {
                kind: f.bikeKind,
                brand: f.bikeBrand || undefined,
                model: f.bikeModel || undefined,
                color: f.bikeColor,
              }
            : null,
        documents,
      });
      setProfile(profile);
      toast.success('Cadastro enviado para análise! 📨');
      navigate('/entregador', { replace: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const isLast = label === 'Revisão';

  return (
    <AuthShell
      badge="Entregador"
      title="Cadastro de entregador"
      subtitle="Um processo guiado, rapidinho. Seu cadastro passa por análise antes de liberar."
      image="/canecas.jpg"
      footer={
        step === 0 ? (
          <>
            Já tem conta?{' '}
            <Link to="/entregador/login" className="font-semibold text-brand-2 hover:underline">
              Entrar
            </Link>
          </>
        ) : undefined
      }
    >
      <Stepper steps={steps} current={step} />

      <div className="space-y-4">
        {/* -------------------------------- Tipo -------------------------------- */}
        {label === 'Tipo' && (
          <div>
            <p className="mb-3 text-sm text-cream-3">Como você pretende fazer as entregas?</p>
            <div className="grid grid-cols-2 gap-3">
              <VehicleCard
                active={vehicle === 'bicicleta'}
                emoji="🚲"
                title="Bicicleta"
                desc="Sem CNH. Identidade + dados da bike."
                onClick={() => setVehicle('bicicleta')}
              />
              <VehicleCard
                active={vehicle === 'moto'}
                emoji="🏍️"
                title="Moto"
                desc="CNH, documento e dados da moto."
                onClick={() => setVehicle('moto')}
              />
            </div>
            {errors.vehicle && <p className="mt-2 text-xs text-danger">{errors.vehicle}</p>}
          </div>
        )}

        {/* -------------------------------- Dados ------------------------------- */}
        {label === 'Dados' && (
          <>
            <Input
              label="Nome completo"
              value={f.fullName}
              onChange={(e) => set('fullName')(e.target.value)}
              error={errors.fullName}
              leftIcon={<User size={16} />}
              autoComplete="name"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="CPF"
                placeholder="000.000.000-00"
                value={f.cpf}
                onChange={(e) => set('cpf')(formatCPF(e.target.value))}
                error={errors.cpf}
                leftIcon={<IdCard size={16} />}
                inputMode="numeric"
              />
              <Input
                label="RG"
                value={f.rg}
                onChange={(e) => set('rg')(e.target.value)}
                error={errors.rg}
              />
            </div>
            <Input
              label="Data de nascimento"
              placeholder="DD/MM/AAAA"
              value={f.birthDate}
              onChange={(e) => set('birthDate')(formatDateInput(e.target.value))}
              error={errors.birthDate}
              leftIcon={<Calendar size={16} />}
              inputMode="numeric"
            />
            <Input
              label="E-mail"
              type="email"
              placeholder="voce@email.com"
              value={f.email}
              onChange={(e) => set('email')(e.target.value)}
              error={errors.email}
              leftIcon={<Mail size={16} />}
              autoComplete="email"
            />
            <Input
              label="Telefone"
              placeholder="(31) 99999-9999"
              value={f.phone}
              onChange={(e) => set('phone')(formatPhone(e.target.value))}
              error={errors.phone}
              leftIcon={<Phone size={16} />}
              inputMode="tel"
            />
            <PasswordField
              label="Senha"
              value={f.password}
              onChange={set('password')}
              error={errors.password}
              showStrength
              autoComplete="new-password"
            />
          </>
        )}

        {/* ------------------------------ Endereço ------------------------------ */}
        {label === 'Endereço' && (
          <>
            <Input
              label="CEP"
              placeholder="00000-000"
              value={f.zip}
              onChange={(e) => onZip(e.target.value)}
              error={errors.zip}
              leftIcon={<MapPin size={16} />}
              inputMode="numeric"
              rightSlot={cepLoading ? <Loader2 size={15} className="animate-spin text-cream-3" /> : undefined}
              hint="Preenchemos o endereço pelo CEP."
            />
            <div className="grid grid-cols-[1fr_90px] gap-3">
              <Input
                label="Rua"
                value={f.street}
                onChange={(e) => set('street')(e.target.value)}
                error={errors.street}
              />
              <Input
                label="Número"
                value={f.number}
                onChange={(e) => set('number')(e.target.value)}
                error={errors.number}
                inputMode="numeric"
              />
            </div>
            <Input
              label="Complemento (opcional)"
              value={f.complement}
              onChange={(e) => set('complement')(e.target.value)}
            />
            <Input
              label="Bairro"
              value={f.neighborhood}
              onChange={(e) => set('neighborhood')(e.target.value)}
              error={errors.neighborhood}
            />
            <div className="grid grid-cols-[1fr_90px] gap-3">
              <Input
                label="Cidade"
                value={f.city}
                onChange={(e) => set('city')(e.target.value)}
                error={errors.city}
              />
              <Input
                label="UF"
                value={f.state}
                onChange={(e) => set('state')(e.target.value.toUpperCase().slice(0, 2))}
                error={errors.state}
                maxLength={2}
              />
            </div>
          </>
        )}

        {/* ----------------------------- Identidade ----------------------------- */}
        {label === 'Identidade' && (
          <>
            <div className="rounded-xl border border-amber/25 bg-amber/5 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-cream">
                <ScanFace size={16} className="text-amber" /> Vamos confirmar que é você
              </p>
              <ul className="mt-2 space-y-1 text-xs text-cream-3">
                <li className="flex items-center gap-2"><Sun size={13} className="text-amber" /> Fique em um ambiente iluminado</li>
                <li className="flex items-center gap-2"><Glasses size={13} className="text-amber" /> Não use óculos escuros</li>
                <li className="flex items-center gap-2"><User size={13} className="text-amber" /> Rosto visível, só você na foto</li>
                <li className="flex items-center gap-2"><ScanFace size={13} className="text-amber" /> Centralize o rosto na moldura</li>
              </ul>
            </div>
            <PhotoCapture
              kind="selfie"
              mode="selfie"
              label="Selfie"
              hint="Usada para confirmar sua identidade."
              value={docs.selfie}
              onCapture={setDoc('selfie')}
              allowUpload={false}
            />
            {errors.selfie && <p className="-mt-2 text-xs text-danger">{errors.selfie}</p>}
            <PhotoCapture
              kind="id_document"
              mode="document"
              label="Documento de identificação (RG ou CNH)"
              hint="Foto nítida, sem cortes e sem reflexo."
              value={docs.id_document}
              onCapture={setDoc('id_document')}
            />
            {errors.id_document && <p className="-mt-2 text-xs text-danger">{errors.id_document}</p>}
          </>
        )}

        {/* -------------------------------- CNH --------------------------------- */}
        {label === 'CNH' && (
          <>
            <p className="text-sm text-cream-3">
              Informe os dados da sua habilitação. A categoria precisa habilitar moto.
            </p>
            <Input
              label="Número da CNH"
              value={f.cnhNumber}
              onChange={(e) => set('cnhNumber')(formatDigits(e.target.value, 11))}
              error={errors.cnhNumber}
              inputMode="numeric"
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Categoria"
                value={f.cnhCategory}
                onChange={(e) => set('cnhCategory')(e.target.value)}
                error={errors.cnhCategory}
                options={CNH_CATEGORIES}
              />
              <Input
                label="Validade"
                placeholder="DD/MM/AAAA"
                value={f.cnhExpiry}
                onChange={(e) => set('cnhExpiry')(formatDateInput(e.target.value))}
                error={errors.cnhExpiry}
                inputMode="numeric"
              />
            </div>
            <PhotoCapture
              kind="cnh_front"
              label="Foto da frente da CNH"
              value={docs.cnh_front}
              onCapture={setDoc('cnh_front')}
            />
            {errors.cnh_front && <p className="-mt-2 text-xs text-danger">{errors.cnh_front}</p>}
            <PhotoCapture
              kind="cnh_back"
              label="Foto do verso da CNH"
              value={docs.cnh_back}
              onCapture={setDoc('cnh_back')}
            />
            {errors.cnh_back && <p className="-mt-2 text-xs text-danger">{errors.cnh_back}</p>}
          </>
        )}

        {/* -------------------------------- Moto -------------------------------- */}
        {label === 'Moto' && (
          <>
            <p className="text-sm text-cream-3">
              Cadastre a moto que você utilizará para realizar as entregas.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Marca" placeholder="Honda" value={f.motoBrand} onChange={(e) => set('motoBrand')(e.target.value)} error={errors.motoBrand} />
              <Input label="Modelo" placeholder="CG 160" value={f.motoModel} onChange={(e) => set('motoModel')(e.target.value)} error={errors.motoModel} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Ano" value={f.motoYear} onChange={(e) => set('motoYear')(formatDigits(e.target.value, 4))} error={errors.motoYear} inputMode="numeric" />
              <Input label="Cor" placeholder="Vermelha" value={f.motoColor} onChange={(e) => set('motoColor')(e.target.value)} error={errors.motoColor} />
              <Input label="Placa" placeholder="ABC1D23" value={f.motoPlate} onChange={(e) => set('motoPlate')(formatPlate(e.target.value))} error={errors.motoPlate} />
            </div>
            <Input
              label="RENAVAM (opcional)"
              value={f.motoRenavam}
              onChange={(e) => set('motoRenavam')(formatDigits(e.target.value, 11))}
              error={errors.motoRenavam}
              inputMode="numeric"
            />
            <PhotoCapture kind="vehicle_doc" label="Documento do veículo (CRLV)" value={docs.vehicle_doc} onCapture={setDoc('vehicle_doc')} />
            {errors.vehicle_doc && <p className="-mt-2 text-xs text-danger">{errors.vehicle_doc}</p>}
            <PhotoCapture kind="vehicle_photo" label="Foto da moto" value={docs.vehicle_photo} onCapture={setDoc('vehicle_photo')} />
            {errors.vehicle_photo && <p className="-mt-2 text-xs text-danger">{errors.vehicle_photo}</p>}
            <PhotoCapture kind="plate_photo" label="Foto da placa" value={docs.plate_photo} onCapture={setDoc('plate_photo')} />
            {errors.plate_photo && <p className="-mt-2 text-xs text-danger">{errors.plate_photo}</p>}
          </>
        )}

        {/* ------------------------------ Bicicleta ----------------------------- */}
        {label === 'Bicicleta' && (
          <>
            <p className="text-sm text-cream-3">Conte um pouco sobre sua bicicleta.</p>
            <Select
              label="Tipo de bicicleta"
              value={f.bikeKind}
              onChange={(e) => set('bikeKind')(e.target.value)}
              options={[
                { value: 'convencional', label: 'Convencional' },
                { value: 'eletrica', label: 'Elétrica' },
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Marca (opcional)" value={f.bikeBrand} onChange={(e) => set('bikeBrand')(e.target.value)} />
              <Input label="Modelo (opcional)" value={f.bikeModel} onChange={(e) => set('bikeModel')(e.target.value)} />
            </div>
            <Input label="Cor" placeholder="Preta" value={f.bikeColor} onChange={(e) => set('bikeColor')(e.target.value)} error={errors.bikeColor} />
            <PhotoCapture kind="bike_photo" label="Foto da bicicleta" hint="Usada para conferência cadastral." value={docs.bike_photo} onCapture={setDoc('bike_photo')} />
            {errors.bike_photo && <p className="-mt-2 text-xs text-danger">{errors.bike_photo}</p>}
          </>
        )}

        {/* ------------------------------- Revisão ------------------------------ */}
        {label === 'Revisão' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-brand/25 bg-brand/5 p-4 text-sm text-cream-3">
              <p className="flex items-center gap-2 font-semibold text-cream">
                <ShieldCheck size={16} className="text-brand-2" /> Confira antes de enviar
              </p>
              <p className="mt-1 text-xs">
                Depois do envio, seu cadastro fica bloqueado para alterações até a análise —
                exceto o que a administração solicitar.
              </p>
            </div>

            <ReviewSection title="Dados pessoais" onEdit={() => goTo(steps.indexOf('Dados'))}>
              <ReviewRow k="Nome" v={f.fullName} />
              <ReviewRow k="CPF" v={f.cpf} />
              <ReviewRow k="Telefone" v={f.phone} />
              <ReviewRow k="E-mail" v={f.email} />
            </ReviewSection>

            <ReviewSection title="Endereço" onEdit={() => goTo(steps.indexOf('Endereço'))}>
              <ReviewRow k="Endereço" v={`${f.street}, ${f.number}${f.complement ? ` — ${f.complement}` : ''}`} />
              <ReviewRow k="Bairro" v={`${f.neighborhood} — ${f.city}/${f.state}`} />
              <ReviewRow k="CEP" v={f.zip} />
            </ReviewSection>

            <ReviewSection title="Tipo de entrega" onEdit={() => goTo(0)}>
              <ReviewRow k="Veículo" v={vehicle === 'moto' ? '🏍️ Moto' : '🚲 Bicicleta'} />
            </ReviewSection>

            {vehicle === 'moto' ? (
              <>
                <ReviewSection title="CNH" onEdit={() => goTo(steps.indexOf('CNH'))}>
                  <ReviewRow k="Número" v={f.cnhNumber} />
                  <ReviewRow k="Categoria" v={f.cnhCategory} />
                  <ReviewRow k="Validade" v={f.cnhExpiry} />
                </ReviewSection>
                <ReviewSection title="Moto" onEdit={() => goTo(steps.indexOf('Moto'))}>
                  <ReviewRow k="Veículo" v={`${f.motoBrand} ${f.motoModel} ${f.motoYear}`} />
                  <ReviewRow k="Cor / Placa" v={`${f.motoColor} · ${formatPlate(f.motoPlate)}`} />
                </ReviewSection>
              </>
            ) : (
              <ReviewSection title="Bicicleta" onEdit={() => goTo(steps.indexOf('Bicicleta'))}>
                <ReviewRow k="Tipo" v={f.bikeKind === 'eletrica' ? 'Elétrica' : 'Convencional'} />
                <ReviewRow k="Cor" v={f.bikeColor} />
              </ReviewSection>
            )}

            <ReviewSection title="Documentação" onEdit={() => goTo(steps.indexOf('Identidade'))}>
              <DocCheck label="Selfie" ok={!!docs.selfie} />
              <DocCheck label="Documento de identidade" ok={!!docs.id_document} />
              {vehicle === 'moto' && (
                <>
                  <DocCheck label="CNH (frente e verso)" ok={!!docs.cnh_front && !!docs.cnh_back} />
                  <DocCheck label="Documento do veículo" ok={!!docs.vehicle_doc} />
                  <DocCheck label="Fotos da moto e placa" ok={!!docs.vehicle_photo && !!docs.plate_photo} />
                </>
              )}
              {vehicle === 'bicicleta' && <DocCheck label="Foto da bicicleta" ok={!!docs.bike_photo} />}
            </ReviewSection>
          </div>
        )}
      </div>

      {/* ------------------------------ Navegação ------------------------------ */}
      <div className="mt-6 flex gap-3">
        <Button variant="ghost" onClick={back} leftIcon={<ArrowLeft size={16} />} disabled={loading}>
          {step === 0 ? 'Entrar' : 'Voltar'}
        </Button>
        {isLast ? (
          <Button variant="amber" fullWidth onClick={submit} loading={loading}>
            Enviar para aprovação
          </Button>
        ) : (
          <Button variant="amber" fullWidth onClick={next} rightIcon={<ArrowRight size={16} />}>
            Continuar
          </Button>
        )}
      </div>
    </AuthShell>
  );
}

/* ------------------------------ Subcomponentes ----------------------------- */

function VehicleCard({
  active,
  emoji,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  emoji: string;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-colors',
        active ? 'border-amber bg-amber/10' : 'border-ink-4 hover:border-ink-5',
      )}
    >
      <span className="text-3xl">{emoji}</span>
      <span className={cn('mt-1 font-semibold', active ? 'text-cream' : 'text-cream')}>
        {title}
      </span>
      <span className="text-xs text-cream-3">{desc}</span>
      {active && (
        <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber">
          <Bike size={12} /> Selecionado
        </span>
      )}
    </button>
  );
}

function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-ink-3 bg-ink-2 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-cream">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-2 hover:underline"
        >
          <Pencil size={12} /> Editar
        </button>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function ReviewRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-cream-3">{k}</span>
      <span className="text-right font-medium text-cream">{v || '—'}</span>
    </div>
  );
}

function DocCheck({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <CheckCircle2 size={15} className={ok ? 'text-success' : 'text-ink-5'} />
      <span className={ok ? 'text-cream' : 'text-cream-3'}>{label}</span>
    </div>
  );
}
