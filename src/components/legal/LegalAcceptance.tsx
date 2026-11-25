import { useEffect, useState } from 'react';
import { LegalLinks } from './LegalDocuments';
import { getSupabase } from '@/services/supabase/client';
import type { LegalDocumentKind, LegalRevisions } from '@/services/types';

type Requirement = {
  kind: LegalDocumentKind;
  revision: number;
  accepted: boolean;
  changes?: { revision: number; summary: string }[];
};

export function useLegalRequirements() {
  const [documents, setDocuments] = useState<Requirement[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    let request: AbortController | undefined;
    const refresh = async () => {
      if (request || document.hidden) return;
      const controller = new AbortController();
      request = controller;
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      try {
        const { data, error } = await getSupabase().rpc('legal_requirements')
          .abortSignal(controller.signal);
        if (error || !Array.isArray(data)) throw error ?? new Error('Resposta de documentos inválida.');
        if (active) {
          setDocuments(data);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      } finally {
        window.clearTimeout(timeout);
        request = undefined;
      }
    };
    const onVisible = () => void refresh();
    onVisible();
    const timer = window.setInterval(onVisible, 30_000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      active = false;
      request?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [retry]);

  return { documents, error, refresh: () => setRetry(value => value + 1) };
}

export function LegalAcceptanceFields({ documents, selections, onChange, disabled }: {
  documents: Requirement[];
  selections: Partial<LegalRevisions>;
  onChange: (kind: LegalDocumentKind, revision?: number) => void;
  disabled?: boolean;
}) {
  const versions: Partial<LegalRevisions> = {};
  for (const doc of documents) versions[doc.kind] = doc.revision;

  return (
    <fieldset disabled={disabled} className="card space-y-2 px-4 pb-3 pt-1">
      <legend className="px-1 text-sm font-semibold text-cream">Documentos legais</legend>
      <LegalLinks revisions={versions} />
      {(['terms', 'privacy'] as const).map(kind => {
        const revision = versions[kind];
        if (revision === undefined) return null;
        return (
          <label key={kind} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm leading-snug text-cream">
            <input type="checkbox" checked={selections[kind] === revision}
              onChange={event => onChange(kind, event.target.checked ? revision : undefined)}
              className="h-5 w-5 shrink-0 accent-brand" />
            <span>
              {kind === 'terms' ? 'Aceito os Termos de Uso' : 'Li a Política de Privacidade'}
              <span className="ml-1 text-xs text-cream-3">(versão {revision})</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

export function useSignupLegalAcceptance() {
  const { documents, error, refresh } = useLegalRequirements();
  const [selections, setSelections] = useState<Partial<LegalRevisions>>({});
  const terms = documents?.find(doc => doc.kind === 'terms')?.revision;
  const privacy = documents?.find(doc => doc.kind === 'privacy')?.revision;
  const ready = !error && terms !== undefined && privacy !== undefined;
  const acceptance = ready && terms === selections.terms && privacy === selections.privacy ? { terms, privacy } : null;
  return {
    acceptance,
    refresh,
    fields: {
      documents: ready ? documents : null,
      error,
      loading: !documents && !error,
      refresh,
      selections,
      onChange: (kind: LegalDocumentKind, revision?: number) => setSelections(current => ({ ...current, [kind]: revision })),
    },
  };
}

export function SignupLegalFields({ fields, disabled }: {
  fields: ReturnType<typeof useSignupLegalAcceptance>['fields'];
  disabled?: boolean;
}) {
  if (fields.documents) return <LegalAcceptanceFields documents={fields.documents} selections={fields.selections}
    onChange={fields.onChange} disabled={disabled} />;
  return (
    <div className="space-y-2 text-sm text-cream-3" role="status">
      <p>{fields.loading ? 'Buscando os documentos do cadastro…' : fields.error
        ? 'Não foi possível carregar os documentos do cadastro.'
        : 'O cadastro estará disponível quando os documentos oficiais forem publicados.'}</p>
      {!fields.loading && <button type="button" className="text-brand-2 underline" onClick={fields.refresh}>Verificar novamente</button>}
      <LegalLinks />
    </div>
  );
}
