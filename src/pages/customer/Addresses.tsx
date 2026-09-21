import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Star,
  LocateFixed,
  Search,
  Loader2,
  Pencil,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/providers/ToastProvider';
import { useGeolocation } from '@/hooks/useGeolocation';
import { repository } from '@/services';
import { searchAddress, reverseGeocode, type GeocodeResult } from '@/services/geocoding';
import type { Address, AddressLabel, LatLng } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { FullScreenLoader } from '@/components/ui/Spinner';
import { AddressPickerMap } from '@/components/maps/AddressPickerMap';
import { RESTAURANT } from '@/data/restaurant';
import { uid } from '@/utils/id';
import { formatKm } from '@/utils/format';
import { haversineKm } from '@/utils/geo';
import { cn } from '@/utils/cn';

const LABELS: { value: AddressLabel; emoji: string; text: string }[] = [
  { value: 'casa', emoji: '🏠', text: 'Casa' },
  { value: 'trabalho', emoji: '💼', text: 'Trabalho' },
  { value: 'outro', emoji: '📍', text: 'Outro' },
];

export function Addresses() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Address | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const load = () => {
    if (!profile) return;
    repository.getAddresses(profile.id).then((list) => {
      setAddresses(list);
      setLoading(false);
    });
  };

  useEffect(load, [profile]);

  const setDefault = async (a: Address) => {
    if (!profile || a.isDefault) return;
    await repository.setDefaultAddress(profile.id, a.id);
    load();
  };

  const remove = async () => {
    if (!toDelete) return;
    await repository.deleteAddress(toDelete);
    setToDelete(null);
    load();
    toast.success('Endereço removido.');
  };

  if (loading) return <FullScreenLoader />;

  return (
    <div className="px-4 pt-4">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-cream" aria-label="Voltar">
          <ArrowLeft size={22} />
        </button>
        <h1 className="display text-2xl text-cream">Meus endereços</h1>
      </div>

      <Button fullWidth variant="ghost" leftIcon={<Plus size={18} />} onClick={() => setCreating(true)}>
        Adicionar endereço
      </Button>

      <div className="mt-4 space-y-3">
        {addresses.length === 0 ? (
          <EmptyState emoji="📍" title="Nenhum endereço salvo" description="Adicione onde entregamos." />
        ) : (
          addresses.map((a) => {
            const km = haversineKm(RESTAURANT.location, { lat: a.lat, lng: a.lng });
            const meta = LABELS.find((l) => l.value === a.label)!;
            return (
              <div key={a.id} className="card p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold text-cream">
                      <span>{meta.emoji}</span> {meta.text}
                      {a.isDefault && (
                        <span className="badge bg-amber/15 text-amber">
                          <Star size={11} /> Principal
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-sm text-cream-3">
                      {a.street}, {a.number}
                      {a.complement ? ` · ${a.complement}` : ''}
                    </p>
                    <p className="text-xs text-cream-3">
                      {a.neighborhood}, {a.city}/{a.state} · {formatKm(km)} do buteco
                    </p>
                    {a.reference && (
                      <p className="mt-0.5 text-xs italic text-cream-3">Ref.: {a.reference}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => setEditing(a)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-cream-3 hover:text-cream"
                      aria-label="Editar"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => setToDelete(a.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-cream-3 hover:text-danger"
                      aria-label="Excluir"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                {!a.isDefault && (
                  <button
                    onClick={() => setDefault(a)}
                    className="mt-2 text-xs font-semibold text-brand-2 hover:underline"
                  >
                    Definir como principal
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {(creating || editing) && profile && (
        <AddressEditor
          userId={profile.id}
          initial={editing}
          isFirst={addresses.length === 0}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            load();
            toast.success('Endereço salvo!');
          }}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Remover endereço"
        message="Tem certeza que deseja remover este endereço?"
        confirmLabel="Remover"
        danger
      />
    </div>
  );
}

/* --------------------------- Editor --------------------------- */

function AddressEditor({
  userId,
  initial,
  isFirst,
  onClose,
  onSaved,
}: {
  userId: string;
  initial: Address | null;
  isFirst: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const geo = useGeolocation();

  const [point, setPoint] = useState<LatLng>(
    initial ? { lat: initial.lat, lng: initial.lng } : RESTAURANT.location,
  );
  const [label, setLabel] = useState<AddressLabel>(initial?.label ?? 'casa');
  const [form, setForm] = useState({
    street: initial?.street ?? '',
    number: initial?.number ?? '',
    complement: initial?.complement ?? '',
    reference: initial?.reference ?? '',
    neighborhood: initial?.neighborhood ?? '',
    city: initial?.city ?? RESTAURANT.city,
    state: initial?.state ?? RESTAURANT.state,
    zip: initial?.zip ?? '',
  });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const applyResult = (r: GeocodeResult) => {
    setPoint({ lat: r.lat, lng: r.lng });
    setForm((f) => ({
      ...f,
      street: r.street ?? f.street,
      number: r.number ?? f.number,
      neighborhood: r.neighborhood ?? f.neighborhood,
      city: r.city ?? f.city,
      state: r.state ?? f.state,
      zip: r.zip ?? f.zip,
    }));
    setResults([]);
    setQuery(r.street ? `${r.street}${r.number ? `, ${r.number}` : ''}` : r.displayName);
  };

  const runSearch = async () => {
    if (query.trim().length < 3) return;
    setSearching(true);
    try {
      setResults(await searchAddress(query));
    } catch {
      toast.error('Não foi possível buscar. Tente ajustar no mapa.');
    } finally {
      setSearching(false);
    }
  };

  const useMyLocation = async () => {
    try {
      const pos = await geo.request();
      setPoint(pos);
      const r = await reverseGeocode(pos);
      applyResult(r);
      toast.success('Localização detectada!');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Ao mover o pino no mapa, tenta preencher o endereço por geocodificação reversa.
  const onPinChange = async (p: LatLng) => {
    setPoint(p);
    try {
      const r = await reverseGeocode(p);
      setForm((f) => ({
        ...f,
        street: r.street ?? f.street,
        neighborhood: r.neighborhood ?? f.neighborhood,
        city: r.city ?? f.city,
        state: r.state ?? f.state,
        zip: r.zip ?? f.zip,
      }));
    } catch {
      /* silencioso — o usuário pode digitar manualmente */
    }
  };

  const save = async () => {
    if (!form.street.trim() || !form.number.trim()) {
      toast.error('Informe ao menos a rua e o número.');
      return;
    }
    setSaving(true);
    try {
      const address: Address = {
        id: initial?.id ?? uid('a'),
        userId,
        label,
        street: form.street.trim(),
        number: form.number.trim(),
        complement: form.complement.trim() || undefined,
        reference: form.reference.trim() || undefined,
        neighborhood: form.neighborhood.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        zip: form.zip.trim() || undefined,
        lat: point.lat,
        lng: point.lng,
        isDefault: initial?.isDefault ?? isFirst,
        createdAt: initial?.createdAt ?? new Date().toISOString(),
      };
      await repository.saveAddress(address);
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? 'Editar endereço' : 'Novo endereço'}
      footer={
        <Button fullWidth size="lg" onClick={save} loading={saving}>
          Salvar endereço
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Busca + localização */}
        <div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cream-3" />
              <input
                className="input pl-9"
                placeholder="Buscar endereço…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              />
            </div>
            <Button variant="ghost" onClick={runSearch} disabled={searching}>
              {searching ? <Loader2 size={16} className="animate-spin" /> : 'Buscar'}
            </Button>
          </div>
          <button
            onClick={useMyLocation}
            disabled={geo.loading}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-2 disabled:opacity-60"
          >
            {geo.loading ? <Loader2 size={14} className="animate-spin" /> : <LocateFixed size={14} />}
            Usar minha localização atual
          </button>

          {results.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-lg border border-ink-4">
              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => applyResult(r)}
                  className="block w-full border-b border-ink-4/60 px-3 py-2 text-left text-xs text-cream-3 last:border-0 hover:bg-ink-3"
                >
                  {r.displayName}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mapa */}
        <div className="h-48 overflow-hidden rounded-xl border border-ink-3">
          <AddressPickerMap value={point} onChange={onPinChange} />
        </div>
        <p className="-mt-2 text-center text-[11px] text-cream-3">
          Toque no mapa ou arraste o pino para ajustar a localização exata.
        </p>

        {/* Etiqueta */}
        <div className="flex gap-2">
          {LABELS.map((l) => (
            <button
              key={l.value}
              onClick={() => setLabel(l.value)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium transition-colors',
                label === l.value ? 'border-brand bg-brand/10 text-cream' : 'border-ink-4 text-cream-3',
              )}
            >
              <span>{l.emoji}</span> {l.text}
            </button>
          ))}
        </div>

        {/* Campos */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Input label="Rua" value={form.street} onChange={(e) => set('street')(e.target.value)} />
          </div>
          <Input label="Número" value={form.number} onChange={(e) => set('number')(e.target.value)} />
        </div>
        <Input
          label="Complemento"
          placeholder="Apto, bloco, casa…"
          value={form.complement}
          onChange={(e) => set('complement')(e.target.value)}
        />
        <Input
          label="Ponto de referência"
          placeholder="Ex.: portão azul, ao lado do mercado"
          value={form.reference}
          onChange={(e) => set('reference')(e.target.value)}
        />
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Input
              label="Bairro"
              value={form.neighborhood}
              onChange={(e) => set('neighborhood')(e.target.value)}
            />
          </div>
          <Input label="Cidade" value={form.city} onChange={(e) => set('city')(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
