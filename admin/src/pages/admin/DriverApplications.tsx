import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  X,
  RefreshCw,
  ShieldCheck,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  FileText,
  ScanFace,
  Bot,
} from 'lucide-react';
import { repository } from '@/services';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/providers/ToastProvider';
import type {
  ApplicationDocument,
  CheckStatus,
  DriverApplication,
  DriverApplicationStatus,
  ReviewEvent,
  VerificationCheck,
} from '@/types';
import type { ReviewDecision } from '@/services/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, formatDateTime } from '@/utils/format';
import { cn } from '@/utils/cn';

type FilterValue = DriverApplicationStatus | 'all' | 'to_confirm';

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'to_confirm', label: '🟢 A confirmar' },
  { value: 'manual_review', label: '🟠 Revisão manual' },
  { value: 'under_analysis', label: '🟡 Em análise' },
  { value: 'needs_resubmission', label: '🔁 Reenvio' },
  { value: 'approved', label: '✅ Aprovadas' },
  { value: 'rejected', label: '🔴 Reprovadas' },
];

const STATUS_META: Record<DriverApplicationStatus, { label: string; cls: string }> = {
  pending_documents: { label: 'Documentos pendentes', cls: 'bg-ink-4 text-cream-2' },
  under_analysis: { label: '🟡 Em análise', cls: 'bg-amber/15 text-amber' },
  manual_review: { label: '🟠 Revisão manual', cls: 'bg-orange-500/15 text-orange-400' },
  approved: { label: '🟢 Aprovado', cls: 'bg-success/15 text-success' },
  rejected: { label: '🔴 Reprovado', cls: 'bg-danger/15 text-danger' },
  needs_resubmission: { label: '🔁 Reenvio solicitado', cls: 'bg-amber/15 text-amber' },
};

const REASON_PRESETS = [
  'Documento ilegível',
  'Selfie não corresponde ao documento',
  'CNH vencida',
  'Dados divergentes',
  'Documento não pôde ser validado',
  'Necessária nova captura',
];

const DOC_LABEL: Record<ApplicationDocument['kind'], string> = {
  selfie: 'Selfie',
  id_document: 'Documento de identidade',
  cnh_front: 'CNH (frente)',
  cnh_back: 'CNH (verso)',
  vehicle_doc: 'Documento do veículo',
  vehicle_photo: 'Foto da moto',
  plate_photo: 'Foto da placa',
  bike_photo: 'Foto da bicicleta',
};

function formatCPF(v: string): string {
  const d = (v || '').replace(/\D/g, '').padStart(11, '').slice(0, 11);
  if (d.length !== 11) return v;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function StatusChip({ status }: { status: DriverApplicationStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', m.cls)}>{m.label}</span>
  );
}

export function DriverApplications() {
  const { profile } = useAuth();
  const toast = useToast();
  const [apps, setApps] = useState<DriverApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();

  const load = async () => {
    try {
      setApps(await repository.getDriverApplications());
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const t = setInterval(load, 8000); // atualiza sozinho, sem recarregar
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Link vindo da página de Entregadores: /solicitacoes?user=<id> abre a ficha.
  const userParam = params.get('user');
  useEffect(() => {
    if (userParam && apps.length) {
      const match = apps.find((a) => a.userId === userParam);
      if (match) setSelectedId(match.id);
    }
  }, [userParam, apps]);

  const clearSelection = () => {
    setSelectedId(null);
    if (userParam) {
      params.delete('user');
      setParams(params, { replace: true });
    }
  };

  const filtered = useMemo(() => {
    if (filter === 'all') return apps;
    if (filter === 'to_confirm')
      return apps.filter((a) => a.status === 'approved' && !a.adminConfirmed);
    return apps.filter((a) => a.status === filter);
  }, [apps, filter]);
  const selected = apps.find((a) => a.id === selectedId) ?? null;

  if (selected) {
    return (
      <ApplicationDetail
        app={selected}
        adminId={profile?.id ?? ''}
        onBack={clearSelection}
        onReviewed={async () => {
          await load();
          clearSelection();
        }}
      />
    );
  }

  const pendingCount = apps.filter(
    (a) =>
      a.status === 'manual_review' ||
      a.status === 'under_analysis' ||
      (a.status === 'approved' && !a.adminConfirmed),
  ).length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="display text-3xl text-cream">Solicitações de cadastro</h1>
        {pendingCount > 0 && (
          <span className="rounded-full bg-amber/15 px-3 py-1 text-sm font-semibold text-amber">
            {pendingCount} aguardando
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-cream-3">Cadastros de entregadores enviados pelo aplicativo.</p>

      <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((fl) => (
          <button
            key={fl.value}
            onClick={() => setFilter(fl.value)}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
              filter === fl.value
                ? 'border-brand bg-brand text-cream'
                : 'border-ink-4 text-cream-3 hover:border-ink-5',
            )}
          >
            {fl.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-10 text-center text-cream-3">Carregando…</p>
      ) : filtered.length === 0 ? (
        <EmptyState emoji="📋" title="Nenhuma solicitação" description="Não há cadastros neste filtro." />
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedId(a.id)}
              className="card p-4 text-left transition-colors hover:border-ink-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber/15 text-lg">
                    {a.vehicle === 'moto' ? '🏍️' : '🚲'}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-cream">{a.fullName}</p>
                    <p className="text-xs text-cream-3">{formatCPF(a.cpf)}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusChip status={a.status} />
                  {a.status === 'approved' && !a.adminConfirmed && (
                    <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-semibold text-amber">
                      a confirmar
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-cream-3">
                <span>{a.vehicle === 'moto' ? 'Moto' : 'Bicicleta'}</span>
                <span>{formatDate(a.createdAt)}</span>
              </div>
              {a.autoAnalysis && (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-cream-3">
                  <Bot size={12} /> Triagem: {recommendationLabel(a.autoAnalysis.recommendation)}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Detalhe ---------------------------------- */

function ApplicationDetail({
  app,
  adminId,
  onBack,
  onReviewed,
}: {
  app: DriverApplication;
  adminId: string;
  onBack: () => void;
  onReviewed: () => Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [reasonModal, setReasonModal] = useState<null | 'reject' | 'request_resubmission'>(null);
  const [reason, setReason] = useState('');
  const [docUrls, setDocUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      const entries = await Promise.all(
        app.documents.map(async (d) => [d.kind, (await repository.getDocumentUrl(d.path)) ?? ''] as const),
      );
      if (active) setDocUrls(Object.fromEntries(entries));
    })();
    return () => {
      active = false;
    };
  }, [app.documents]);

  const decide = async (decision: ReviewDecision) => {
    setBusy(true);
    try {
      await repository.reviewDriverApplication(app.id, decision, adminId);
      toast.success(
        decision.action === 'approve'
          ? 'Cadastro aprovado.'
          : decision.action === 'reject'
            ? 'Cadastro reprovado.'
            : 'Reenvio solicitado.',
      );
      setReasonModal(null);
      setReason('');
      await onReviewed();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitReason = () => {
    if (!reason.trim()) {
      toast.error('Informe o motivo.');
      return;
    }
    void decide({ action: reasonModal!, reason: reason.trim() });
  };

  // Aprovado automaticamente e ainda aguardando a mini-aprovação do admin.
  const awaitingConfirm = app.status === 'approved' && !app.adminConfirmed;
  // Sem mais ações: reprovado, ou aprovado E já confirmado pelo admin.
  const done = app.status === 'rejected' || (app.status === 'approved' && app.adminConfirmed);
  const analysis = app.autoAnalysis;

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm text-cream-3 hover:text-cream">
        <ArrowLeft size={16} /> Voltar para a lista
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber/15 text-xl">
            {app.vehicle === 'moto' ? '🏍️' : '🚲'}
          </span>
          <div>
            <h1 className="display text-2xl text-cream">{app.fullName}</h1>
            <p className="text-sm text-cream-3">
              {app.vehicle === 'moto' ? 'Entregador de moto' : 'Entregador de bicicleta'} ·{' '}
              enviado em {formatDate(app.createdAt)}
            </p>
          </div>
        </div>
        <StatusChip status={app.status} />
      </div>

      {/* Aprovado automaticamente — aguardando a mini-aprovação do admin */}
      {awaitingConfirm && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-success/30 bg-success/5 p-4 text-sm">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-success" />
          <div>
            <p className="font-semibold text-cream">Liberado automaticamente pela triagem</p>
            <p className="text-cream-3">
              O entregador já pode operar. Confira os documentos e confirme o cadastro (mini-aprovação).
            </p>
          </div>
        </div>
      )}

      {/* Veredito da triagem (padrão Lux: verdito + motivos + checagem oficial) */}
      {analysis && (
        <section
          className={cn(
            'mt-5 rounded-2xl border p-5',
            analysis.recommendation === 'reject'
              ? 'border-danger/30 bg-danger/5'
              : analysis.recommendation === 'auto_approve'
                ? 'border-success/30 bg-success/5'
                : 'border-amber/30 bg-amber/5',
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-cream-3">Veredito da triagem</p>
              <p className="mt-1 text-lg font-bold text-cream">
                {analysis.recommendation === 'reject'
                  ? '🔴 Reprovar'
                  : analysis.recommendation === 'auto_approve'
                    ? '🟢 Aprovar'
                    : '🟠 Revisão manual necessária'}
              </p>
            </div>
            <div className="text-right text-xs text-cream-3">
              <p>Confiança: {analysis.confidence != null ? `${analysis.confidence}%` : '—'}</p>
              <p>Analisado em {formatDateTime(analysis.analyzedAt)}</p>
            </div>
          </div>

          {attentionChecks(analysis.checks).length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-cream-2">Pontos de atenção</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {attentionChecks(analysis.checks).map((c) => (
                  <span
                    key={c.id}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[11px] font-medium',
                      c.status === 'fail' ? 'bg-danger/15 text-danger' : 'bg-amber/15 text-amber',
                    )}
                  >
                    {c.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Verificações que dependem de fornecedor externo (como no Lux v1) */}
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <OfficialRow label="Semelhança selfie × documento" value="Não configurado" />
            <OfficialRow label="Antecedentes / base oficial" value="Não consultado" />
            <OfficialRow label="CPF único no sistema" value="Sim" ok />
          </div>
        </section>
      )}

      {/* Análise automática */}
      {analysis && (
        <section className="card mt-5 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-cream">
            <Bot size={16} className="text-brand-2" /> Análise automática (triagem)
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <span className="text-cream-3">
              Recomendação:{' '}
              <span className="font-semibold text-cream">{recommendationLabel(analysis.recommendation)}</span>
            </span>
            <span className="text-cream-3">
              Confiança:{' '}
              <span className="font-semibold text-cream">
                {analysis.confidence != null ? `${analysis.confidence}%` : '—'}
              </span>
            </span>
            <span className="text-cream-3">Provedor: {analysis.provider}</span>
          </div>
          <ul className="mt-3 space-y-2">
            {analysis.checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                <CheckIcon status={c.status} />
                <div>
                  <p className="text-cream">{c.label}</p>
                  {c.detail && <p className="text-xs text-cream-3">{c.detail}</p>}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded-lg bg-ink-3/50 p-3 text-[11px] text-cream-3">
            A triagem não valida autenticidade sozinha. Confirme os documentos e a identidade antes de aprovar.
          </p>
        </section>
      )}

      {/* Dados + comparação */}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-cream">Dados informados</h2>
          <Row k="Nome" v={app.fullName} />
          <Row k="CPF" v={formatCPF(app.cpf)} />
          <Row k="RG" v={app.rg} />
          <Row k="Nascimento" v={app.birthDate} />
          <Row k="E-mail" v={app.email} />
          <Row k="Telefone" v={app.phone} />
          <Row
            k="Endereço"
            v={`${app.address.street}, ${app.address.number} — ${app.address.neighborhood}, ${app.address.city}/${app.address.state}`}
          />
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-cream">
            {app.vehicle === 'moto' ? 'CNH e veículo' : 'Bicicleta'}
          </h2>
          {app.vehicle === 'moto' ? (
            <>
              <Row k="CNH" v={app.cnh?.number ?? '—'} />
              <Row k="Categoria" v={app.cnh?.category ?? '—'} />
              <Row k="Validade" v={app.cnh?.expiresAt ?? '—'} />
              <div className="my-2 border-t border-ink-3" />
              <Row k="Moto" v={`${app.moto?.brand ?? ''} ${app.moto?.model ?? ''} ${app.moto?.year ?? ''}`} />
              <Row k="Cor" v={app.moto?.color ?? '—'} />
              <Row k="Placa" v={app.moto?.plate ?? '—'} />
              <Row k="RENAVAM" v={app.moto?.renavam ?? '—'} />
            </>
          ) : (
            <>
              <Row k="Tipo" v={app.bike?.kind === 'eletrica' ? 'Elétrica' : 'Convencional'} />
              <Row k="Marca" v={app.bike?.brand ?? '—'} />
              <Row k="Modelo" v={app.bike?.model ?? '—'} />
              <Row k="Cor" v={app.bike?.color ?? '—'} />
            </>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-cream-3">
            <CircleAlert size={12} /> OCR não configurado — confira os dados contra os documentos.
          </p>
        </section>
      </div>

      {/* Documentos */}
      <section className="card mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-cream">
          <FileText size={16} /> Documentos enviados
        </h2>
        {app.documents.length === 0 ? (
          <p className="text-sm text-cream-3">Nenhum arquivo anexado.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {app.documents.map((d) => (
              <a
                key={d.kind}
                href={docUrls[d.kind] || undefined}
                target="_blank"
                rel="noreferrer"
                className="group overflow-hidden rounded-xl border border-ink-3 bg-ink-2"
              >
                <div className="flex h-28 items-center justify-center bg-ink-3/40">
                  {docUrls[d.kind] ? (
                    <img src={docUrls[d.kind]} alt={DOC_LABEL[d.kind]} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-cream-3">
                      {d.kind === 'selfie' ? <ScanFace size={22} /> : <FileText size={22} />}
                    </span>
                  )}
                </div>
                <p className="px-2 py-1.5 text-[11px] font-medium text-cream-2 group-hover:text-cream">
                  {DOC_LABEL[d.kind]}
                </p>
              </a>
            ))}
          </div>
        )}
      </section>

      {/* Histórico */}
      {app.reviews.length > 0 && (
        <section className="card mt-4 p-5">
          <h2 className="mb-3 text-sm font-semibold text-cream">Histórico de análise</h2>
          <ol className="space-y-3">
            {[...app.reviews].reverse().map((r, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <ReviewIcon action={r.action} />
                <div>
                  <p className="text-cream">{reviewLabel(r.action)}</p>
                  {r.reason && <p className="text-xs text-cream-2">“{r.reason}”</p>}
                  <p className="text-xs text-cream-3">
                    {formatDateTime(r.at)}
                    {r.by && r.by !== 'auto' ? ` · por ${r.by === adminId ? 'você' : r.by.slice(0, 8)}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Ações */}
      {!done && (
        <div className="sticky bottom-0 mt-5 flex flex-wrap gap-2 border-t border-ink-3 bg-ink/90 py-4 backdrop-blur">
          {awaitingConfirm ? (
            <Button
              variant="primary"
              leftIcon={<ShieldCheck size={16} />}
              loading={busy}
              onClick={() => decide({ action: 'confirm' })}
            >
              Confirmar aprovação
            </Button>
          ) : (
            <Button
              variant="primary"
              leftIcon={<Check size={16} />}
              loading={busy}
              onClick={() => decide({ action: 'approve' })}
            >
              Aprovar cadastro
            </Button>
          )}
          {!awaitingConfirm && (
            <Button variant="ghost" leftIcon={<RefreshCw size={16} />} onClick={() => setReasonModal('request_resubmission')}>
              Solicitar reenvio
            </Button>
          )}
          <Button variant="danger" leftIcon={<X size={16} />} onClick={() => setReasonModal('reject')}>
            Reprovar
          </Button>
        </div>
      )}

      {done && (
        <p className="mt-5 border-t border-ink-3 py-4 text-center text-sm text-cream-3">
          {app.status === 'approved'
            ? '✅ Cadastro aprovado e confirmado.'
            : '🔴 Cadastro reprovado.'}
        </p>
      )}

      {/* Modal de motivo */}
      <Modal
        open={reasonModal !== null}
        onClose={() => setReasonModal(null)}
        title={reasonModal === 'reject' ? 'Reprovar cadastro' : 'Solicitar novo envio'}
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" fullWidth onClick={() => setReasonModal(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button
              variant={reasonModal === 'reject' ? 'danger' : 'primary'}
              fullWidth
              onClick={submitReason}
              loading={busy}
            >
              Confirmar
            </Button>
          </div>
        }
      >
        <p className="mb-3 text-sm text-cream-3">Informe o motivo — o entregador verá esta mensagem.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {REASON_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setReason(p)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                reason === p ? 'border-brand bg-brand/15 text-cream' : 'border-ink-4 text-cream-3 hover:border-ink-5',
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <Input
          label="Motivo"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Descreva o que precisa ser corrigido"
        />
      </Modal>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="shrink-0 text-cream-3">{k}</span>
      <span className="text-right font-medium text-cream">{v || '—'}</span>
    </div>
  );
}

function OfficialRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="rounded-lg bg-ink-3/50 p-2.5">
      <p className="text-[11px] text-cream-3">{label}</p>
      <p className={cn('mt-0.5 text-sm font-semibold', ok ? 'text-success' : 'text-cream-2')}>{value}</p>
    </div>
  );
}

/** Checagens que pedem atenção do admin (alertas e falhas). */
function attentionChecks(checks: VerificationCheck[]): VerificationCheck[] {
  return checks.filter((c) => c.status === 'warn' || c.status === 'fail');
}

function CheckIcon({ status }: { status: CheckStatus }) {
  if (status === 'pass') return <CircleCheck size={16} className="mt-0.5 shrink-0 text-success" />;
  if (status === 'fail') return <CircleX size={16} className="mt-0.5 shrink-0 text-danger" />;
  if (status === 'warn') return <CircleAlert size={16} className="mt-0.5 shrink-0 text-amber" />;
  return <CircleDashed size={16} className="mt-0.5 shrink-0 text-cream-3" />;
}

function ReviewIcon({ action }: { action: ReviewEvent['action'] }) {
  const cls = 'mt-0.5 shrink-0';
  if (action === 'approved') return <ShieldCheck size={15} className={cn(cls, 'text-success')} />;
  if (action === 'rejected') return <CircleX size={15} className={cn(cls, 'text-danger')} />;
  if (action === 'resubmission_requested') return <RefreshCw size={15} className={cn(cls, 'text-amber')} />;
  if (action === 'auto_analysis') return <Bot size={15} className={cn(cls, 'text-brand-2')} />;
  return <CircleDashed size={15} className={cn(cls, 'text-cream-3')} />;
}

function recommendationLabel(rec: 'auto_approve' | 'manual_review' | 'reject'): string {
  return { auto_approve: 'Aprovação automática', manual_review: 'Revisão manual', reject: 'Reprovar' }[rec];
}

function reviewLabel(action: ReviewEvent['action']): string {
  return {
    submitted: 'Cadastro enviado pelo entregador',
    auto_analysis: 'Análise automática concluída',
    approved: 'Cadastro aprovado',
    rejected: 'Cadastro reprovado',
    resubmission_requested: 'Reenvio solicitado',
  }[action];
}
