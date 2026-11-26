import { useEffect, useState } from 'react';
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

export function LegalAcceptanceField({
  kind,
  checked,
  onChange,
  disabled,
}: {
  kind?: LegalDocumentKind;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const label = kind === 'terms' ? 'Aceito os Termos de Uso'
    : kind === 'privacy' ? 'Li a Política de Privacidade'
      : 'Aceito os Termos de Uso e li a Política de Privacidade';

  return (
    <label className="card flex min-h-12 cursor-pointer items-center gap-3 px-4 py-3 text-sm leading-snug text-cream has-disabled:cursor-default">
      <input type="checkbox" checked={checked} disabled={disabled}
        onChange={event => onChange(event.target.checked)}
        className="h-5 w-5 shrink-0 accent-brand" />
      <span>{label}</span>
    </label>
  );
}

export function useSignupLegalAcceptance() {
  const { documents, error, refresh } = useLegalRequirements();
  const [selected, setSelected] = useState<LegalRevisions | null>(null);
  const terms = documents?.find(doc => doc.kind === 'terms')?.revision;
  const privacy = documents?.find(doc => doc.kind === 'privacy')?.revision;
  const revisions = !error && terms !== undefined && privacy !== undefined ? { terms, privacy } : undefined;
  const acceptance = revisions && selected?.terms === terms && selected?.privacy === privacy ? revisions : null;

  return {
    acceptance,
    revisions,
    refresh,
    fields: {
      ready: Boolean(revisions),
      checked: acceptance !== null,
      message: error ? 'Não foi possível carregar os documentos do cadastro.'
        : documents && !revisions ? 'O cadastro estará disponível quando os documentos oficiais forem publicados.'
        : null,
      refresh,
      onChange: (checked: boolean) => setSelected(checked ? revisions ?? null : null),
    },
  };
}

export function SignupLegalFields({ fields, disabled }: {
  fields: ReturnType<typeof useSignupLegalAcceptance>['fields'];
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <LegalAcceptanceField checked={fields.checked} onChange={fields.onChange} disabled={disabled || !fields.ready} />
      {fields.message && (
        <div className="space-y-2 text-sm text-cream-3" role="status">
          <p>{fields.message}</p>
          <button type="button" className="text-brand-2 underline" onClick={fields.refresh}>Verificar novamente</button>
        </div>
      )}
    </div>
  );
}
