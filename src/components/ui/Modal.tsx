import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-ink/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-in relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-ink-3 bg-ink-2 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-ink-3 px-5 py-4">
          <h2 className="display text-lg text-cream">{title}</h2>
          <button onClick={onClose} className="text-cream-3 hover:text-cream" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="border-t border-ink-3 p-5">{footer}</div>}
      </div>
    </div>
  );
}

/** Diálogo de confirmação para ações perigosas. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  danger = false,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-3">
          <Button variant="ghost" fullWidth onClick={onClose} disabled={loading}>
            Voltar
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            fullWidth
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-cream-3">{message}</p>
    </Modal>
  );
}
