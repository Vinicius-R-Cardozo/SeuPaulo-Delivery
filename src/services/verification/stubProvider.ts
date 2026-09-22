/**
 * Provedor de TRIAGEM (stub). Faz apenas checagens objetivas do que dá para
 * medir sem um fornecedor externo: presença do arquivo, tamanho/qualidade
 * mínima e consistência dos dados digitados. Ele NUNCA afirma que um documento
 * é verdadeiro, nem faz reconhecimento facial ou liveness de verdade — quando
 * o dado não pode ser verificado, a checagem fica como "skipped" e a
 * recomendação vai para revisão manual.
 *
 * Para ligar um fornecedor real, implemente as interfaces em ./types e troque
 * a exportação em ./index.
 */
import type { AutoAnalysisResult, VerificationCheck } from '@/types';
import type {
  AnalysisBundle,
  CapturedFile,
  DocumentAnalysis,
  DocumentAnalysisInput,
  DocumentVerificationService,
  IdentityAnalysis,
  IdentityAnalysisInput,
  IdentityVerificationService,
  VehicleAnalysis,
  VehicleAnalysisInput,
  VehicleVerificationService,
  VerificationProvider,
} from './types';

const MIN_BYTES = 20 * 1024; // ~20 KB: abaixo disso a foto é pequena/borrada demais
const NAME = 'triagem-interna';

function qualityCheck(id: string, label: string, file: CapturedFile | undefined): VerificationCheck {
  if (!file) return { id, label, status: 'fail', detail: 'Arquivo não enviado.' };
  if (!file.mime.startsWith('image/')) {
    return { id, label, status: 'fail', detail: 'O arquivo não é uma imagem.' };
  }
  if (file.sizeBytes < MIN_BYTES) {
    return { id, label, status: 'warn', detail: 'Imagem de baixa resolução — pode dificultar a leitura.' };
  }
  return { id, label, status: 'pass', detail: 'Imagem recebida com qualidade aceitável.' };
}

class StubDocumentService implements DocumentVerificationService {
  readonly name = NAME;
  async analyzeDocument(input: DocumentAnalysisInput): Promise<DocumentAnalysis> {
    const checks: VerificationCheck[] = [
      qualityCheck(`doc:${input.expected}:quality`, 'Qualidade da imagem do documento', input.file),
      {
        id: `doc:${input.expected}:ocr`,
        label: 'Leitura automática (OCR) dos campos',
        status: 'skipped',
        detail: 'OCR não configurado — conferência dos dados será feita na revisão manual.',
      },
      {
        id: `doc:${input.expected}:tamper`,
        label: 'Sinais de adulteração',
        status: 'skipped',
        detail: 'Sem fornecedor de validação documental — requer revisão manual.',
      },
    ];
    // Sem OCR real, não extraímos dados nem afirmamos consistência.
    return { checks, ocr: null, confidence: null };
  }
}

class StubIdentityService implements IdentityVerificationService {
  readonly name = NAME;
  async analyzeIdentity(input: IdentityAnalysisInput): Promise<IdentityAnalysis> {
    const checks: VerificationCheck[] = [
      qualityCheck('id:selfie:quality', 'Qualidade da selfie', input.selfie),
      {
        id: 'id:liveness',
        label: 'Prova de vida (liveness)',
        status: 'skipped',
        detail: 'Anti-spoofing não configurado — verificar na revisão manual.',
      },
      {
        id: 'id:facematch',
        label: 'Selfie corresponde ao documento',
        status: 'skipped',
        detail: 'Comparação facial não configurada — verificar na revisão manual.',
      },
    ];
    return { checks, faceMatchScore: null, livenessPassed: null };
  }
}

class StubVehicleService implements VehicleVerificationService {
  readonly name = NAME;
  async analyzeVehicle(input: VehicleAnalysisInput): Promise<VehicleAnalysis> {
    const checks: VerificationCheck[] = [];
    if (input.vehicle === 'moto') {
      checks.push(qualityCheck('veh:doc:quality', 'Qualidade do documento do veículo', input.document));
      checks.push({
        id: 'veh:plate',
        label: 'Consistência da placa',
        status: input.plate ? 'skipped' : 'fail',
        detail: input.plate
          ? 'Conferência da placa contra base oficial não configurada — revisão manual.'
          : 'Placa não informada.',
      });
    } else {
      checks.push(qualityCheck('veh:bike:photo', 'Foto da bicicleta', input.document));
    }
    return { checks, ocr: null };
  }
}

/**
 * Regra de triagem:
 * - qualquer checagem "fail" → recomenda revisão manual (nunca reprova sozinho
 *   por não ter conseguido verificar; reprovação por conteúdo é decisão humana);
 * - sem fornecedor real, a recomendação nunca é aprovação automática.
 */
function decide(checks: VerificationCheck[]): AutoAnalysisResult['recommendation'] {
  const hasFail = checks.some((c) => c.status === 'fail');
  // Só encaminha para revisão manual. Aprovação automática exige fornecedor real.
  return hasFail ? 'manual_review' : 'manual_review';
}

class StubProvider implements VerificationProvider {
  readonly name = NAME;
  documents = new StubDocumentService();
  identity = new StubIdentityService();
  vehicle = new StubVehicleService();

  async analyze(bundle: AnalysisBundle): Promise<AutoAnalysisResult> {
    const byKind = (k: CapturedFile['kind']) => bundle.files.find((f) => f.kind === k);
    const checks: VerificationCheck[] = [];

    const identity = await this.identity.analyzeIdentity({
      selfie: byKind('selfie')!,
      idDocument: byKind('id_document'),
    });
    checks.push(...identity.checks);

    const idDoc = await this.documents.analyzeDocument({
      file: byKind('id_document')!,
      expected: 'id_document',
    });
    checks.push(...idDoc.checks);

    if (bundle.vehicle === 'moto') {
      const cnhFront = await this.documents.analyzeDocument({
        file: byKind('cnh_front')!,
        expected: 'cnh_front',
        claimed: bundle.claimed.cnh,
      });
      checks.push(...cnhFront.checks);
      const vehicle = await this.vehicle.analyzeVehicle({
        vehicle: 'moto',
        plate: bundle.claimed.moto?.plate,
        renavam: bundle.claimed.moto?.renavam,
        document: byKind('vehicle_doc'),
      });
      checks.push(...vehicle.checks);
    } else {
      const vehicle = await this.vehicle.analyzeVehicle({
        vehicle: 'bicicleta',
        document: byKind('bike_photo'),
      });
      checks.push(...vehicle.checks);
    }

    return {
      recommendation: decide(checks),
      confidence: null,
      checks,
      provider: this.name,
      analyzedAt: new Date().toISOString(),
    };
  }
}

export const stubProvider: VerificationProvider = new StubProvider();
