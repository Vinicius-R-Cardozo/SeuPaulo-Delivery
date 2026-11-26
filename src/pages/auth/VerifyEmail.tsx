import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MailCheck, RotateCcw, ShieldCheck } from 'lucide-react';
import { AuthShell } from '@/components/layout/AuthShell';
import { Button } from '@/components/ui/Button';
import { repository } from '@/services';
import { clearCustomerVerification, readCustomerVerification, saveCustomerVerification } from '@/services/customerVerification';
import { useToast } from '@/providers/ToastProvider';
import { cn } from '@/utils/cn';

const RESEND_COOLDOWN_S = 60;
const TTL_S = 5 * 60;

export function VerifyEmail() {
  const navigate = useNavigate();
  const toast = useToast();

  const [{ email, expiresAt }, setVerification] = useState(readCustomerVerification);
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [now, setNow] = useState<number>(Date.now());
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!email) navigate('/cadastro', { replace: true });
  }, [email, navigate]);

  // Relógio de 1s para o contador.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remainingMs = Math.max(0, expiresAt - now);
  const expired = expiresAt > 0 && remainingMs <= 0;
  const mm = String(Math.floor(remainingMs / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, '0');
  const sentAt = expiresAt - TTL_S * 1000;
  const canResend = expired || (now - sentAt) / 1000 >= RESEND_COOLDOWN_S;
  const resendIn = Math.max(0, Math.ceil(RESEND_COOLDOWN_S - (now - sentAt) / 1000));
  const code = digits.join('');

  const setDigit = (i: number, v: string) => {
    const d = v.replace(/\D/g, '');
    setError(null);
    if (!d) {
      setDigits((arr) => arr.map((x, idx) => (idx === i ? '' : x)));
      return;
    }
    // Se colou vários números num campo, distribui a partir dele.
    const chars = d.split('');
    setDigits((arr) => {
      const next = [...arr];
      let pos = i;
      for (const c of chars) {
        if (pos > 5) break;
        next[pos] = c;
        pos++;
      }
      const focus = Math.min(pos, 5);
      requestAnimationFrame(() => inputs.current[focus]?.focus());
      return next;
    });
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) inputs.current[i + 1]?.focus();
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = ['', '', '', '', '', ''];
    text.split('').forEach((c, idx) => (next[idx] = c));
    setDigits(next);
    requestAnimationFrame(() => inputs.current[Math.min(text.length, 5)]?.focus());
  };

  const confirm = async () => {
    if (code.length !== 6 || expired) return;
    setLoading(true);
    setError(null);
    try {
      await repository.verifyCustomerEmail(email, code);
      clearCustomerVerification();
      toast.success('E-mail verificado com sucesso! Sua conta foi criada. 🎉');
      navigate('/login', { replace: true, state: { email } });
    } catch (err) {
      setError((err as Error).message);
      setDigits(['', '', '', '', '', '']);
      requestAnimationFrame(() => inputs.current[0]?.focus());
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    try {
      const { expiresAt: exp } = await repository.resendCustomerCode(email);
      saveCustomerVerification(email, exp);
      setVerification({ email, expiresAt: Date.parse(exp) });
      setDigits(['', '', '', '', '', '']);
      toast.success('Novo código enviado para o seu e-mail.');
      requestAnimationFrame(() => inputs.current[0]?.focus());
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell
      badge="Verificação"
      title="Verifique seu e-mail"
      subtitle={
        email
          ? `Enviamos um código de 6 dígitos para ${email}.`
          : 'Enviamos um código de 6 dígitos para o seu e-mail.'
      }
      image="/bar-mesa.jpg"
      footer={
        <>
          E-mail errado?{' '}
          <Link to="/cadastro" className="font-semibold text-brand-2 hover:underline">
            Voltar ao cadastro
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-xl border border-brand/20 bg-brand/5 p-3 text-sm text-cream-3">
          <MailCheck size={18} className="shrink-0 text-brand-2" />
          <span>Digite o código que chegou no seu e-mail para ativar a conta.</span>
        </div>

        {/* 6 campos */}
        <div className="flex justify-center gap-2" onPaste={onPaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              disabled={loading}
              aria-label={`Dígito ${i + 1}`}
              autoFocus={i === 0}
              className={cn(
                'h-14 w-11 rounded-xl border bg-ink-2 text-center font-mono text-2xl font-bold text-cream outline-none transition-colors sm:w-12',
                error ? 'border-danger' : d ? 'border-amber' : 'border-ink-4',
                'focus:border-amber',
              )}
            />
          ))}
        </div>

        {/* Contador / expirado */}
        <div className="text-center text-sm">
          {expired ? (
            <p className="font-medium text-danger">
              Este código expirou. Solicite um novo código para continuar.
            </p>
          ) : (
            <p className="text-cream-3">
              Código válido por{' '}
              <span className="font-mono font-semibold text-cream">
                {mm}:{ss}
              </span>
            </p>
          )}
          {error && <p className="mt-1 text-danger">{error}</p>}
        </div>

        {!expired && (
          <Button fullWidth size="lg" onClick={confirm} loading={loading} disabled={code.length !== 6}>
            Confirmar código
          </Button>
        )}

        <div className="text-center">
          <button
            type="button"
            onClick={resend}
            disabled={!canResend || resending}
            className={cn(
              'inline-flex items-center gap-1.5 text-sm font-medium transition-colors',
              canResend && !resending ? 'text-brand-2 hover:underline' : 'cursor-not-allowed text-cream-3',
            )}
          >
            <RotateCcw size={14} className={resending ? 'animate-spin' : ''} />
            {expired
              ? 'Enviar novo código'
              : canResend
                ? 'Reenviar código'
                : `Reenviar em ${resendIn}s`}
          </button>
        </div>

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-cream-3">
          <ShieldCheck size={13} /> Sua conta só é ativada após a verificação do e-mail.
        </p>
      </div>
    </AuthShell>
  );
}
