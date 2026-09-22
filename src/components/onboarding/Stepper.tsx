import { Check } from 'lucide-react';
import { cn } from '@/utils/cn';

/** Indicador de progresso do onboarding (mobile-first). */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  const pct = steps.length > 1 ? (current / (steps.length - 1)) * 100 : 0;
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-amber">
          Etapa {current + 1} de {steps.length}
        </span>
        <span className="text-cream-3">{steps[current]}</span>
      </div>
      <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-ink-3">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-amber transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-3 hidden items-center justify-between sm:flex">
        {steps.map((label, i) => (
          <div key={label} className="flex flex-1 flex-col items-center gap-1">
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors',
                i < current && 'bg-amber text-ink',
                i === current && 'bg-amber/20 text-amber ring-2 ring-amber',
                i > current && 'bg-ink-3 text-cream-3',
              )}
            >
              {i < current ? <Check size={13} /> : i + 1}
            </span>
            <span
              className={cn(
                'text-center text-[10px] leading-tight',
                i === current ? 'text-cream' : 'text-cream-3',
              )}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
