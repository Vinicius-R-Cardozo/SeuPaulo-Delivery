import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/Logo';

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
  image = '/bar-fachada.jpg',
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  children: ReactNode;
  footer?: ReactNode;
  image?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Lado da imagem (desktop) */}
      <div className="relative hidden lg:block lg:w-1/2">
        <img src={image} alt="Seu Paulo Buteco" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/20" />
        <div className="absolute bottom-10 left-10 right-10">
          <Logo size="lg" />
          <p className="mt-4 max-w-sm text-lg text-cream/80">
            O boteco de verdade, agora com entrega. Petisco gelado, comida quente e aquele
            atendimento de casa.
          </p>
        </div>
      </div>

      {/* Lado do formulário */}
      <div className="flex flex-1 flex-col justify-center px-5 py-10 sm:px-10 lg:w-1/2">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo size="md" />
          </div>
          {badge && (
            <span className="eyebrow mb-3 inline-block rounded-full bg-brand/15 px-3 py-1 text-brand-2">
              {badge}
            </span>
          )}
          <h1 className="display text-3xl text-cream sm:text-4xl">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-cream-3">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-cream-3">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
