import type { ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LegalFooter } from '@/components/legal/LegalDocuments';
import type { LegalRevisions } from '@/services/types';
import { Logo } from '@/components/ui/Logo';
import { cn } from '@/utils/cn';

/**
 * Moldura das telas de autenticação: foto real do boteco ao fundo, com o
 * cartão de formulário sobre o creme de papel kraft — a cara do Seu Paulo.
 */
export function AuthShell({
  title,
  subtitle,
  badge,
  children,
  footer,
  showLegalLinks = false,
  legalRevisions,
  image = '/bar-fachada.jpg',
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  children: ReactNode;
  footer?: ReactNode;
  showLegalLinks?: boolean;
  legalRevisions?: LegalRevisions;
  image?: string;
}) {
  const native = Capacitor.isNativePlatform();

  return (
    <div className={cn('flex min-h-dvh flex-col', !native && 'lg:flex-row')}>
      {/* Lado da imagem (desktop) */}
      {!native && <div className="relative hidden lg:block lg:w-1/2">
        <img src={image} alt="Seu Paulo Buteco" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/20" />
        <div className="absolute bottom-10 left-10 right-10">
          <Logo size="lg" />
          <p className="mt-4 max-w-sm text-lg text-cream/80">
            O boteco de verdade, agora com entrega. Petisco gelado, comida quente e aquele
            atendimento de casa.
          </p>
        </div>
      </div>}

      {/* Lado do formulário */}
      <div className={cn('flex flex-1 flex-col', !native && 'lg:w-1/2')}>
        <main className={cn(
          'flex flex-1 flex-col',
          native ? 'px-6 pb-4 pt-4' : 'justify-center px-5 py-10 sm:px-10',
        )}>
          <div className="mx-auto w-full max-w-md">
            {native ? (
              <header className="mb-7 flex min-h-12 items-center gap-3">
                <Link
                  to="/"
                  aria-label="Voltar ao início"
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-ink-4 bg-ink-2 text-cream"
                >
                  <ArrowLeft size={20} aria-hidden="true" />
                </Link>
                <Logo size="sm" light withText={false} />
              </header>
            ) : (
              <div className="mb-8 lg:hidden"><Logo size="md" /></div>
            )}
            {badge && (
              <span className={cn(
                'mb-3 inline-block',
                native
                  ? 'text-sm font-semibold text-amber-2'
                  : 'eyebrow rounded-full bg-brand/15 px-3 py-1 text-brand-2',
              )}>
                {badge}
              </span>
            )}
            <h1 className={cn(
              'text-3xl text-cream sm:text-4xl',
              native ? 'font-bold leading-tight tracking-tight' : 'display',
            )}>{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-cream-3">{subtitle}</p>}
            <div className={native ? 'mt-6' : 'mt-8'}>{children}</div>
            {footer && <div className="mt-6 text-center text-sm text-cream-3">{footer}</div>}
          </div>
        </main>
        {showLegalLinks && <LegalFooter revisions={legalRevisions} />}
      </div>
    </div>
  );
}
