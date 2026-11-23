import type { DriverRegistrationDocumentKind } from '@/types';

/** Imagem capturada no onboarding (câmera ou arquivo), já redimensionada. */
export interface CapturedMedia {
  kind: DriverRegistrationDocumentKind;
  blob: Blob;
  dataUrl: string;
  mime: string;
  sizeBytes: number;
  width: number;
  height: number;
}

const MAX_SIDE = 1400;
const JPEG_QUALITY = 0.85;

/** Redimensiona (mantendo proporção) e comprime uma imagem para JPEG. */
export async function processImage(
  source: HTMLVideoElement | HTMLImageElement,
  kind: DriverRegistrationDocumentKind,
): Promise<CapturedMedia> {
  const sw = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const sh = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0, w, h);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Falha ao processar imagem.'))),
      'image/jpeg',
      JPEG_QUALITY,
    ),
  );
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  return { kind, blob, dataUrl, mime: 'image/jpeg', sizeBytes: blob.size, width: w, height: h };
}

/** Lê um File (galeria) para um elemento de imagem e processa. */
export async function processFile(file: File, kind: DriverRegistrationDocumentKind): Promise<CapturedMedia> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      img.src = url;
    });
    return await processImage(img, kind);
  } finally {
    URL.revokeObjectURL(url);
  }
}
