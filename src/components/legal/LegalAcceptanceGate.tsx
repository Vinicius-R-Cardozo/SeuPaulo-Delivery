import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { FullScreenLoader } from '@/components/ui/Spinner';
import { LegalAcceptanceFields, useLegalRequirements } from './LegalAcceptance';
import { getSupabase } from '@/services/supabase/client';
import type { LegalRevisions } from '@/services/types';

export function LegalAcceptanceGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { documents, error, refresh } = useLegalRequirements();
  const [selections, setSelections] = useState<Partial<LegalRevisions>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const pending = documents?.filter(document => !document.accepted);
  const changes = pending?.flatMap(document =>
    document.changes?.map(change => ({ ...change, kind: document.kind })) ?? [],
  ) ?? [];

  // Preserve access to an existing order or trip, including completion tools.
  if (/^\/(?:app\/pedido|entregador\/entrega)\/[^/]+\/?$/.test(pathname)) return <>{children}</>;
  if (pending && pending.length === 0) return <>{children}</>;
  if (!pending && !error) return <FullScreenLoader />;

  const ready = Boolean(pending?.every(document => selections[document.kind] === document.revision));
  const submit = async () => {
    if (!ready || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const { error } = await getSupabase().rpc('accept_legal_documents', {
        p_terms_revision: pending?.find(doc => doc.kind === 'terms')?.revision ?? null,
        p_privacy_revision: pending?.find(doc => doc.kind === 'privacy')?.revision ?? null,
      });
      if (error) {
        setFeedback(error.code === '22023' ? error.message : 'Não foi possível salvar a confirmação. Tente novamente.');
      }
      refresh();
    } catch {
      setFeedback('Não foi possível salvar a confirmação. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const leave = async () => {
    try {
      await signOut();
      navigate(pathname.startsWith('/entregador') ? '/entregador/login' : '/login', { replace: true });
    } catch {
      setFeedback('Não foi possível sair da conta. Tente novamente.');
    }
  };

  return (
    <div className="app-public-viewport">
      <main className="mx-auto max-w-md space-y-5 px-5 py-8">
        <h1 className="display text-3xl text-cream">{pending ? 'Revise os documentos vigentes' : 'Documentos legais indisponíveis'}</h1>
        {pending ? (
          <>
            <p className="text-sm leading-relaxed text-cream-3">
              {changes.length > 0
                ? 'Veja as mudanças e confirme os documentos para continuar usando o app.'
                : 'Confira os documentos abaixo e confirme a leitura para continuar usando o app.'}
            </p>
            {changes.length > 0 && (
              <section aria-labelledby="legal-changes-heading" className="card space-y-3 p-4">
                <h2 id="legal-changes-heading" className="text-base font-semibold text-cream">O que mudou</h2>
                <ul className="divide-y divide-ink-3">
                  {changes.map(change => (
                    <li key={`${change.kind}:${change.revision}`} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                      <p className="text-xs font-semibold text-cream-3">
                        {change.kind === 'terms' ? 'Termos de Uso' : 'Política de Privacidade'} · Versão {change.revision}
                      </p>
                      <p className="whitespace-pre-line break-words text-sm leading-relaxed text-cream">{change.summary}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <LegalAcceptanceFields documents={pending} selections={selections} disabled={saving}
              onChange={(kind, revision) => {
                setFeedback(null);
                setSelections(current => ({ ...current, [kind]: revision }));
              }} />
            <Button type="button" fullWidth disabled={!ready} loading={saving} onClick={() => void submit()}>
              Confirmar e continuar
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-cream-3">Não foi possível verificar os documentos do app. Verifique a conexão e tente novamente.</p>
            <Button type="button" fullWidth onClick={refresh}>Tentar novamente</Button>
          </>
        )}
        {feedback && <p role="alert" className="text-sm text-danger">{feedback}</p>}
        <Button type="button" fullWidth variant="ghost" disabled={saving} onClick={() => void leave()}>Sair da conta</Button>
      </main>
    </div>
  );
}
