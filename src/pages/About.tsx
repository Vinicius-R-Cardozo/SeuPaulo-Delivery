import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LegalFooter } from '@/components/legal/LegalDocuments';
import { Logo } from '@/components/ui/Logo';

export function About() {
  return (
    <div className="space-y-5 px-4 pb-6 pt-4">
      <div className="flex items-center gap-3">
        <Link to=".." relative="path" aria-label="Voltar ao perfil"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-ink-4 bg-ink-2 text-cream">
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <h1 className="display text-2xl text-cream">Sobre</h1>
      </div>
      <section className="card flex flex-col items-center gap-3 p-5 text-center">
        <Logo size="sm" withText={false} />
        <p className="font-semibold text-cream">Seu Paulo Delivery</p>
      </section>
      <LegalFooter />
    </div>
  );
}
