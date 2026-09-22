/**
 * Camada de verificação de identidade e documentos.
 *
 * Estas interfaces são o ponto de integração com fornecedores reais de OCR,
 * validação documental, reconhecimento facial e liveness. Hoje usamos um
 * provedor de TRIAGEM (stub) que NÃO afirma que um documento é verdadeiro —
 * ele apenas checa o básico e encaminha para revisão manual. Trocar por um
 * fornecedor real é só implementar estas interfaces, sem mexer no cadastro.
 */
import type { AutoAnalysisResult, DocumentKind, VerificationCheck } from '@/types';

/** Metadados de um arquivo capturado (sem expor o conteúdo binário à triagem). */
export interface CapturedFile {
  kind: DocumentKind;
  mime: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}

/* ----------------------------- Documentos ------------------------------ */

export interface DocumentAnalysisInput {
  file: CapturedFile;
  expected: 'id_document' | 'cnh_front' | 'cnh_back' | 'vehicle_doc';
  /** Dados digitados pelo usuário, para conferência com o OCR quando houver. */
  claimed?: Record<string, string>;
}

export interface DocumentAnalysis {
  checks: VerificationCheck[];
  ocr: Record<string, string> | null;
  confidence: number | null;
}

export interface DocumentVerificationService {
  readonly name: string;
  analyzeDocument(input: DocumentAnalysisInput): Promise<DocumentAnalysis>;
}

/* ------------------------------ Identidade ----------------------------- */

export interface IdentityAnalysisInput {
  selfie: CapturedFile;
  idDocument?: CapturedFile;
}

export interface IdentityAnalysis {
  checks: VerificationCheck[];
  /** 0–100 quando o fornecedor comparar selfie × documento. */
  faceMatchScore: number | null;
  livenessPassed: boolean | null;
}

export interface IdentityVerificationService {
  readonly name: string;
  analyzeIdentity(input: IdentityAnalysisInput): Promise<IdentityAnalysis>;
}

/* -------------------------------- Veículo ------------------------------ */

export interface VehicleAnalysisInput {
  vehicle: 'moto' | 'bicicleta';
  plate?: string;
  renavam?: string;
  document?: CapturedFile;
}

export interface VehicleAnalysis {
  checks: VerificationCheck[];
  ocr: Record<string, string> | null;
}

export interface VehicleVerificationService {
  readonly name: string;
  analyzeVehicle(input: VehicleAnalysisInput): Promise<VehicleAnalysis>;
}

/* ------------------------- Orquestrador de análise --------------------- */

export interface AnalysisBundle {
  vehicle: 'moto' | 'bicicleta';
  files: CapturedFile[];
  claimed: {
    cnh?: Record<string, string>;
    moto?: Record<string, string>;
  };
}

export interface VerificationProvider {
  readonly name: string;
  documents: DocumentVerificationService;
  identity: IdentityVerificationService;
  vehicle: VehicleVerificationService;
  /** Junta as checagens e devolve uma recomendação de triagem. */
  analyze(bundle: AnalysisBundle): Promise<AutoAnalysisResult>;
}
