import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Modal } from '@/components/ui/Modal';
import { getSupabase } from '@/services/supabase/client';
import type { LegalDocumentKind as DocumentKind, LegalRevisions } from '@/services/types';
import termsDraft from '@/data/legal/terms.txt?raw';
import privacyDraft from '@/data/legal/privacy.txt?raw';

const DOCUMENTS = {
  terms: { title: 'Termos de Uso', draft: termsDraft },
  privacy: { title: 'Política de Privacidade', draft: privacyDraft },
} as const;

type Publication = { revision: number; body: string; published_at: string };

const publishedDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' });

function LegalDocumentReader({ kind, revision, showDraft }: { kind: DocumentKind; revision?: number; showDraft?: boolean }) {
  const [publication, setPublication] = useState<Publication | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
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
        const query = getSupabase().from('legal_documents')
          .select('revision,body,published_at')
          .eq('kind', kind);
        if (revision !== undefined) query.eq('revision', revision);
        const { data, error } = await query.order('revision', { ascending: false }).limit(1)
          .abortSignal(controller.signal).maybeSingle<Publication>();
        if (error) throw error;
        if (active) {
          setPublication(data);
          setStatus('ready');
        }
      } catch {
        if (active) setStatus('error');
      } finally {
        window.clearTimeout(timeout);
        request = undefined;
      }
    };
    const onVisible = () => void refresh();
    onVisible();
    const timer = revision === undefined ? window.setInterval(onVisible, 30_000) : undefined;
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      active = false;
      request?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [kind, revision, retry]);

  const body = publication?.body ?? (showDraft && status !== 'loading' ? DOCUMENTS[kind].draft : null);
  return (
    <div className="space-y-4 text-sm leading-relaxed text-cream">
      <div className="space-y-2 text-cream-3" aria-live="polite">
        {publication && <p>Versão {publication.revision} · Publicada em {publishedDate.format(new Date(publication.published_at))}</p>}
        {!publication && status === 'loading' && <p>Buscando a versão publicada…</p>}
        {status === 'ready' && !publication && <p>{body ? 'Minuta para revisão' : 'Este documento ainda não foi publicado.'}</p>}
        {status === 'error' && (
          <>
            <p>{!publication && body ? 'Minuta para revisão. ' : ''}Não foi possível verificar a versão publicada.</p>
            <button type="button" className="text-brand-2 underline" onClick={() => {
              setStatus('loading');
              setRetry(attempt => attempt + 1);
            }}>Tentar novamente</button>
          </>
        )}
      </div>
      {body && (
        <article className="space-y-4 break-words">
          {body.trim().split(/\r?\n(?:[ \t]*\r?\n)+/).map((paragraph, index) => (
            /^\d+\.\s+[^\n]+$/.test(paragraph)
              ? <h3 key={index} className="pt-2 text-base font-semibold">{paragraph}</h3>
              : <p key={index} className="whitespace-pre-line">{paragraph}</p>
          ))}
        </article>
      )}
    </div>
  );
}

export function LegalFooter({ revisions }: { revisions?: Partial<LegalRevisions> }) {
  const [params, setParams] = useSearchParams();
  const appearance = useLocation().state;
  const navigate = useNavigate();
  const selected = params.get('documento');
  const kind = selected === 'terms' || selected === 'privacy' ? selected : null;
  const requestedRevision = Number(params.get('revisao'));
  const revision = Number.isSafeInteger(requestedRevision) && requestedRevision > 0 ? requestedRevision : undefined;

  const close = useCallback(() => {
    if (appearance?.openedLegalDocument === true) {
      navigate(-1);
      return;
    }
    setParams(current => {
      const next = new URLSearchParams(current);
      next.delete('documento');
      next.delete('revisao');
      return next;
    }, { replace: true });
  }, [appearance, navigate, setParams]);

  return (
    <>
      <footer className="app-legal-footer col-span-full mt-auto shrink-0 px-4 text-center">
        <nav className="flex flex-wrap items-center justify-center gap-x-5" aria-label="Documentos legais">
          {(['terms', 'privacy'] as const).map(documentKind => {
            const next = new URLSearchParams(params);
            next.set('documento', documentKind);
            const exactRevision = revisions?.[documentKind];
            if (exactRevision !== undefined) next.set('revisao', String(exactRevision));
            else next.delete('revisao');
            return (
              <Link key={documentKind} to={{ search: next.toString() }} state={{
                ...appearance, openedLegalDocument: true,
              }} className="inline-flex min-h-11 items-center text-sm text-brand-2 underline underline-offset-4">
                {DOCUMENTS[documentKind].title}
              </Link>
            );
          })}
        </nav>
      </footer>
      {kind && (
        <Modal open title={DOCUMENTS[kind].title} onClose={close}>
          <LegalDocumentReader key={`${kind}:${revision}`} kind={kind} revision={revision} showDraft={revision === undefined} />
        </Modal>
      )}
    </>
  );
}

export function PublicLegalDocument({ kind }: { kind: DocumentKind }) {
  const { title } = DOCUMENTS[kind];
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | Seu Paulo Delivery`;
    return () => { document.title = previous; };
  }, [title]);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-5 py-8">
      <p className="text-sm text-cream-3">Seu Paulo Delivery</p>
      <h1 className="display mb-6 mt-2 text-3xl text-cream">{title}</h1>
      <LegalDocumentReader key={kind} kind={kind} />
    </main>
  );
}
