/**
 * Ponto único de acesso à verificação. Troque `verificationProvider` por uma
 * implementação real (OCR + facematch + liveness) quando houver fornecedor.
 */
import { stubProvider } from './stubProvider';
import type { VerificationProvider } from './types';

export const verificationProvider: VerificationProvider = stubProvider;

export type * from './types';
