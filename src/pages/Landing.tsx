import { Link, Navigate } from 'react-router-dom';
import { ShoppingBag, Bike, ShieldCheck, ArrowRight, MapPin, Clock, Star } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { RESTAURANT } from '@/data/restaurant';

export function Landing() {
  const { profile, loading } = useAuth();

  // Se já estiver logado, vai direto ao ambiente correspondente.
  if (!loading && profile) {
    const home = { customer: '/app', driver: '/entregador', admin: '/admin' }[profile.role];
    return <Navigate to={home} replace />;
  }

  return (
    <div className="min-h-screen bg-ink">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <img
          src="/hero.jpg"
          alt="Ambiente do Seu Paulo Buteco"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/85 via-ink/75 to-ink" />
        <div className="relative mx-auto max-w-5xl px-5 pb-16 pt-8 sm:px-8">
          <div className="flex items-center justify-between">
            <Logo size="md" />
            <Link
              to="/login"
              className="text-sm font-semibold text-cream/80 hover:text-cream"
            >
              Entrar
            </Link>
          </div>

          <div className="mx-auto mt-16 max-w-2xl text-center sm:mt-24">
            <span className="eyebrow inline-block rounded-full border border-cream/20 px-4 py-1.5 text-amber">
              {RESTAURANT.neighborhood} · {RESTAURANT.city}/{RESTAURANT.state}
            </span>
            <h1 className="display mt-6 text-5xl leading-[0.95] text-cream sm:text-7xl">
              O boteco na
              <br />
              <span className="text-brand-2">palma da mão</span>
            </h1>
            <p className="mx-auto mt-6 max-w-lg text-pretty text-base text-cream/70 sm:text-lg">
              Petisco crocante, cerveja estupidamente gelada e a comida de sempre — agora com
              entrega rápida e acompanhamento ao vivo até a sua porta.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/cadastro">
                <Button size="lg" rightIcon={<ArrowRight size={18} />}>
                  Fazer meu pedido
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="ghost">
                  Já tenho conta
                </Button>
              </Link>
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-cream/60">
              <span className="inline-flex items-center gap-1.5">
                <Star size={15} className="text-amber" /> 4,9 de avaliação
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock size={15} className="text-amber" /> Entrega em ~{RESTAURANT.avgPrepMinutes} min
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={15} className="text-amber" /> Raio de {RESTAURANT.deliveryRadiusKm} km
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Ambientes */}
      <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8">
        <p className="eyebrow text-center text-cream-3">Acessos do sistema</p>
        <h2 className="display mt-3 text-center text-3xl text-cream sm:text-4xl">
          Três apps, um boteco
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          <EnvCard
            to="/login"
            icon={<ShoppingBag size={22} />}
            title="Cliente"
            desc="Peça, personalize e acompanhe sua entrega em tempo real no mapa."
            cta="Entrar como cliente"
          />
          <EnvCard
            to="/entregador/login"
            icon={<Bike size={22} />}
            title="Entregador"
            desc="Receba entregas, navegue até o cliente e acompanhe seus ganhos."
            cta="Área do entregador"
            accent="amber"
          />
          <EnvCard
            to="/admin/login"
            icon={<ShieldCheck size={22} />}
            title="Administrador"
            desc="Gerencie pedidos, cardápio, entregadores e o faturamento da casa."
            cta="Painel administrativo"
          />
        </div>
      </div>

      <footer className="border-t border-ink-3 py-8 text-center text-xs text-cream-3">
        <p>
          {RESTAURANT.name} · {RESTAURANT.address}, {RESTAURANT.neighborhood} —{' '}
          {RESTAURANT.city}/{RESTAURANT.state}
        </p>
        <p className="mt-1">{RESTAURANT.phoneDisplay} · {RESTAURANT.instagramHandle}</p>
      </footer>
    </div>
  );
}

function EnvCard({
  to,
  icon,
  title,
  desc,
  cta,
  accent = 'brand',
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  cta: string;
  accent?: 'brand' | 'amber';
}) {
  return (
    <Link
      to={to}
      className="card group flex flex-col p-6 transition-colors hover:border-ink-5"
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-xl ${
          accent === 'amber' ? 'bg-amber/15 text-amber' : 'bg-brand/15 text-brand-2'
        }`}
      >
        {icon}
      </span>
      <h3 className="display mt-4 text-xl text-cream">{title}</h3>
      <p className="mt-2 flex-1 text-sm text-cream-3">{desc}</p>
      <span
        className={`mt-4 inline-flex items-center gap-1 text-sm font-semibold ${
          accent === 'amber' ? 'text-amber' : 'text-brand-2'
        }`}
      >
        {cta}
        <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
