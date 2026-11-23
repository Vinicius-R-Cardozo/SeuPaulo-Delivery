import { useEffect, useState } from 'react';
import { CircleAlert, Clock, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { repository } from '@/services';
import type { DriverApplication, DriverApplicationStatus as Status, DriverRegistrationDocumentKind } from '@/types';
import { PhotoCapture } from '@/components/onboarding/PhotoCapture';
import type { CapturedMedia } from '@/components/onboarding/capture';
import { Button } from '@/components/ui/Button';
import { FullScreenLoader } from '@/components/ui/Spinner';
import { formatDateTime } from '@/utils/format';

const VIEW: Record<
  Status,
  { emoji: string; title: string; desc: string; tone: 'wait' | 'bad' | 'action' }
> = {
  pending_documents: {
    emoji: '📄',
    title: 'Faltam documentos',
    desc: 'Seu cadastro está incompleto. Envie os documentos pendentes para prosseguir.',
    tone: 'action',
  },
  under_analysis: {
    emoji: '🟡',
    title: 'Seu cadastro está em análise',
    desc: 'Estamos verificando seus documentos. Isso costuma levar pouco tempo — você será avisado.',
    tone: 'wait',
  },
  manual_review: {
    emoji: '🟠',
    title: 'Seu cadastro está em análise',
    desc: 'Um responsável está conferindo seu cadastro. Você será avisado assim que houver uma resposta.',
    tone: 'wait',
  },
  approved: {
    emoji: '🟢',
    title: 'Cadastro aprovado!',
    desc: 'Tudo certo. Você já pode ficar online e receber entregas.',
    tone: 'wait',
  },
  rejected: {
    emoji: '🔴',
    title: 'Cadastro reprovado',
    desc: 'Infelizmente seu cadastro não foi aprovado.',
    tone: 'bad',
  },
  needs_resubmission: {
    emoji: '🔁',
    title: 'Precisamos de um novo envio',
    desc: 'Falta ajustar algo no seu cadastro. Veja o motivo abaixo.',
    tone: 'action',
  },
};

/**
 * Tela que o entregador vê enquanto o cadastro não está aprovado. Mostra o
 * status granular da candidatura e, quando houver, o motivo pedido pela análise.
 */
export function ApplicationStatus({ fallbackStatus }: { fallbackStatus?: Status }) {
  const { profile } = useAuth();
  const [app, setApp] = useState<DriverApplication | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    const load = () =>
      repository.getDriverApplication(profile.id).then((a) => {
        if (active) {
          setApp((current) => a && current?.id === a.id && current.updatedAt > a.updatedAt ? current : a);
          setLoading(false);
        }
      });
    load();
    // Poll leve para refletir a decisão do admin sem recarregar a página.
    const t = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [profile]);

  if (loading) return <FullScreenLoader />;

  const status: Status = app?.status ?? fallbackStatus ?? 'under_analysis';
  const view = VIEW[status];
  const lastReason = [...(app?.reviews ?? [])].reverse().find((r) => r.reason)?.reason;

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-5 py-8">
      <div className="w-full max-w-sm">
        <div className="card p-8 text-center">
          <div className="text-5xl">{view.emoji}</div>
          <h1 className="display mt-4 text-2xl text-cream">{view.title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-cream-3">{view.desc}</p>

          {(status === 'rejected' || status === 'needs_resubmission') && lastReason && (
            <div
              className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-left text-sm ${
                view.tone === 'bad'
                  ? 'border-danger/30 bg-danger/5 text-cream'
                  : 'border-amber/30 bg-amber/5 text-cream'
              }`}
            >
              {view.tone === 'bad' ? (
                <XCircle size={16} className="mt-0.5 shrink-0 text-danger" />
              ) : (
                <CircleAlert size={16} className="mt-0.5 shrink-0 text-amber" />
              )}
              <span>{lastReason}</span>
            </div>
          )}

        </div>

        {app?.status === 'needs_resubmission' && (
          <DocumentResubmission key={app.updatedAt} application={app} onSubmitted={setApp} />
        )}

        {app && app.reviews.length > 0 && (
          <div className="card mt-4 p-5">
            <p className="mb-3 text-sm font-semibold text-cream">Acompanhamento</p>
            <ol className="space-y-3">
              {[...app.reviews].reverse().map((r, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="mt-0.5 text-cream-3">
                    {r.action === 'approved' ? (
                      <ShieldCheck size={15} className="text-success" />
                    ) : r.action === 'rejected' ? (
                      <XCircle size={15} className="text-danger" />
                    ) : r.action === 'resubmission_requested' || r.action === 'resubmitted' ? (
                      <RefreshCw size={15} className="text-amber" />
                    ) : (
                      <Clock size={15} />
                    )}
                  </span>
                  <div>
                    <p className="text-cream">{reviewLabel(r.action)}</p>
                    <p className="text-xs text-cream-3">{formatDateTime(r.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

const DOCUMENT_LABELS = {
  selfie: 'Selfie',
  cnh_front: 'Frente da CNH',
  cnh_back: 'Verso da CNH',
  vehicle_doc: 'Documento da moto (CRLV-e)',
  bike_photo: 'Foto da bicicleta',
} satisfies Record<DriverRegistrationDocumentKind, string>;

function DocumentResubmission({
  application,
  onSubmitted,
}: {
  application: DriverApplication;
  onSubmitted: (next: DriverApplication) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeKind, setActiveKind] = useState<DriverRegistrationDocumentKind>();
  const [documents, setDocuments] = useState<Partial<Record<DriverRegistrationDocumentKind, CapturedMedia>>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const kinds: DriverRegistrationDocumentKind[] = application.vehicle === 'moto'
    ? ['selfie', 'cnh_front', 'cnh_back', 'vehicle_doc']
    : ['selfie', 'bike_photo'];
  const replacements = Object.values(documents);

  const submit = async () => {
    setSending(true);
    setError('');
    try {
      onSubmitted(await repository.resubmitDriverDocuments(application, replacements));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível reenviar os documentos. Tente novamente.');
      setSending(false);
    }
  };

  if (!open) {
    return (
      <Button className="mt-4" variant="amber" fullWidth onClick={() => setOpen(true)}>
        Reenviar documentos
      </Button>
    );
  }

  return (
    <section className="card mt-4 space-y-4 p-5" aria-labelledby="resubmission-title">
      <h2 id="resubmission-title" className="text-base font-semibold text-cream">Reenviar documentos</h2>
      <p className="text-sm text-cream-3">
        Selecione os documentos solicitados. As outras imagens do cadastro serão mantidas.
      </p>
      <ul className="divide-y divide-ink-3">
        {kinds.map((kind) => (
          <li key={kind} className="py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-cream">
                {DOCUMENT_LABELS[kind]}
                {documents[kind] && <span className="block text-xs text-success">Nova imagem selecionada</span>}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={sending}
                aria-expanded={activeKind === kind}
                aria-label={`Alterar ${DOCUMENT_LABELS[kind]}`}
                onClick={() => setActiveKind(activeKind === kind ? undefined : kind)}
              >
                {activeKind === kind ? 'Fechar' : 'Alterar'}
              </Button>
            </div>
            {activeKind === kind && !sending && (
              <div className="mt-3 pb-2">
                {documents[kind] ? (
                  <>
                    <img src={documents[kind]?.dataUrl} alt={DOCUMENT_LABELS[kind]} className="max-h-56 w-full rounded-xl object-contain" />
                    <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => {
                      setDocuments((current) => {
                        const remaining = { ...current };
                        delete remaining[kind];
                        return remaining;
                      });
                    }}>
                      Remover nova imagem
                    </Button>
                  </>
                ) : (
                  <PhotoCapture
                    kind={kind}
                    label={DOCUMENT_LABELS[kind]}
                    onCapture={(media) => setDocuments((current) => ({ ...current, [kind]: media }))}
                  />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button variant="amber" fullWidth loading={sending} disabled={!replacements.length} onClick={submit}>
        Enviar para análise
      </Button>
    </section>
  );
}

function reviewLabel(action: DriverApplication['reviews'][number]['action']): string {
  return {
    submitted: 'Cadastro enviado',
    auto_analysis: 'Análise automática concluída',
    approved: 'Cadastro aprovado',
    rejected: 'Cadastro reprovado',
    resubmission_requested: 'Novo envio solicitado',
    resubmitted: 'Documentos reenviados',
  }[action];
}
