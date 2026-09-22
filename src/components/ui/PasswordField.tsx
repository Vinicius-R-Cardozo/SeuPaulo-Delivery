import { useState } from 'react';
import { Eye, EyeOff, Lock, Check } from 'lucide-react';
import { Input } from './Input';
import { passwordStrength } from '@/utils/validation';
import { cn } from '@/utils/cn';

export function PasswordField({
  label = 'Senha',
  value,
  onChange,
  error,
  showStrength = false,
  autoComplete = 'current-password',
  placeholder = '••••••••',
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  showStrength?: boolean;
  autoComplete?: string;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  const strength = passwordStrength(value);
  const barColor = ['bg-ink-4', 'bg-danger', 'bg-amber', 'bg-amber-2', 'bg-success'][strength.score];

  return (
    <div>
      <Input
        label={label}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={error}
        autoComplete={autoComplete}
        placeholder={placeholder}
        leftIcon={<Lock size={16} />}
        rightSlot={
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-cream-3 hover:text-cream"
            aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        }
      />
      {showStrength && value.length > 0 && (
        <div className="mt-2">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors',
                  i < strength.score ? barColor : 'bg-ink-4',
                )}
              />
            ))}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-cream-3">
            <Check size={12} className={strength.checks.length ? 'text-success' : 'opacity-30'} />
            Mínimo de 6 caracteres.
            <span className="text-cream-3/70">Misturar números e símbolos deixa mais segura.</span>
          </p>
        </div>
      )}
    </div>
  );
}
