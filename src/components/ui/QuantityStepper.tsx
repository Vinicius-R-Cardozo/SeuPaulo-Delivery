import { Minus, Plus } from 'lucide-react';
import { cn } from '@/utils/cn';

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  size = 'md',
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  size?: 'sm' | 'md';
}) {
  const btn =
    'flex items-center justify-center rounded-lg border border-ink-4 text-cream transition-colors hover:border-brand-2 disabled:opacity-40 disabled:hover:border-ink-4';
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={cn(btn, dim)}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Diminuir quantidade"
      >
        <Minus size={16} />
      </button>
      <span className="w-6 text-center font-mono text-sm tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={cn(btn, dim)}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Aumentar quantidade"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
