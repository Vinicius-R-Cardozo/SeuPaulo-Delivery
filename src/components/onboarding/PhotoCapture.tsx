import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Upload, Check, CircleAlert } from 'lucide-react';
import type { DocumentKind } from '@/types';
import { Button } from '@/components/ui/Button';
import { processFile, processImage, type CapturedMedia } from './capture';
import { cn } from '@/utils/cn';

interface PhotoCaptureProps {
  kind: DocumentKind;
  mode?: 'selfie' | 'document';
  label: string;
  hint?: string;
  value?: CapturedMedia | null;
  onCapture: (media: CapturedMedia) => void;
  /** Documentos permitem enviar do arquivo; selfie prioriza a câmera. */
  allowUpload?: boolean;
}

export function PhotoCapture({
  kind,
  mode = 'document',
  label,
  hint,
  value,
  onCapture,
  allowUpload = true,
}: PhotoCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [live, setLive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = async () => {
    setError(null);
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode === 'selfie' ? 'user' : { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setLive(true);
      // aguarda o vídeo montar antes de atribuir o stream
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError('Permissão de câmera negada. Autorize o acesso para continuar.');
      } else if (name === 'NotFoundError') {
        setError('Nenhuma câmera encontrada neste dispositivo.');
      } else {
        setError('Não foi possível abrir a câmera.');
      }
    } finally {
      setStarting(false);
    }
  };

  const snap = async () => {
    if (!videoRef.current) return;
    try {
      const media = await processImage(videoRef.current, kind, mode === 'selfie');
      onCapture(media);
      stop();
    } catch {
      setError('Falha ao capturar a foto. Tente novamente.');
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      onCapture(await processFile(file, kind));
    } catch {
      setError('Não foi possível ler esse arquivo. Envie uma imagem.');
    }
  };

  /* -------------------------------- Preview -------------------------------- */
  if (value && !live) {
    return (
      <div>
        <span className="label">{label}</span>
        <div className="relative overflow-hidden rounded-2xl border border-success/40 bg-ink-2">
          <img src={value.dataUrl} alt={label} className="max-h-64 w-full object-contain" />
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-success/90 px-2 py-1 text-[11px] font-semibold text-ink">
            <Check size={12} /> Enviada
          </span>
        </div>
        <div className="mt-2 flex gap-2">
          <Button variant="ghost" size="sm" leftIcon={<RefreshCw size={14} />} onClick={start} type="button">
            Refazer
          </Button>
          {allowUpload && (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Upload size={14} />}
              onClick={() => fileRef.current?.click()}
              type="button"
            >
              Trocar arquivo
            </Button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      </div>
    );
  }

  /* --------------------------------- Câmera -------------------------------- */
  if (live) {
    return (
      <div>
        <span className="label">{label}</span>
        <div className="relative overflow-hidden rounded-2xl border border-ink-4 bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className={cn('h-72 w-full object-cover', mode === 'selfie' && '-scale-x-100')}
          />
          {mode === 'selfie' && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-56 w-44 rounded-[50%] border-2 border-dashed border-amber/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
              <span className="absolute bottom-3 left-0 right-0 text-center text-xs text-cream/90">
                Centralize seu rosto na moldura
              </span>
            </div>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <Button variant="amber" fullWidth leftIcon={<Camera size={16} />} onClick={snap} type="button">
            Tirar foto
          </Button>
          <Button variant="ghost" onClick={stop} type="button">
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  /* --------------------------------- Vazio --------------------------------- */
  return (
    <div>
      <span className="label">{label}</span>
      <button
        type="button"
        onClick={start}
        className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-ink-4 bg-ink-2 px-4 py-8 text-center transition-colors hover:border-amber/50"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber/15 text-amber">
          <Camera size={22} />
        </span>
        <span className="text-sm font-medium text-cream">
          {starting ? 'Abrindo câmera…' : mode === 'selfie' ? 'Abrir câmera para selfie' : 'Abrir câmera'}
        </span>
        {hint && <span className="text-xs text-cream-3">{hint}</span>}
      </button>

      {allowUpload && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mt-2 flex w-full items-center justify-center gap-1.5 text-xs text-cream-3 hover:text-cream"
        >
          <Upload size={13} /> ou enviar do dispositivo
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />

      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-danger">
          <CircleAlert size={13} /> {error}
        </p>
      )}
    </div>
  );
}
