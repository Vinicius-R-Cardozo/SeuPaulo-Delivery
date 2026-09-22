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

/** DD/MM/AAAA → Date (meia-noite local) ou null. */
function parseBrDate(v?: string): Date | null {
  const d = (v ?? '').replace(/\D/g, '');
  if (d.length !== 8) return null;
  const date = new Date(Number(d.slice(4, 8)), Number(d.slice(2, 4)) - 1, Number(d.slice(0, 2)));
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Portão de auto-aprovação. Só olha o que é VERIFICÁVEL de forma objetiva
 * (documentos enviados, validade/categoria da CNH, placa). A autenticidade das
 * imagens e o rosto continuam com o admin, na mini-aprovação. Se qualquer
 * critério falhar/for desconhecido → revisão manual (nunca reprova sozinho).
 */
function buildGate(bundle: AnalysisBundle): { checks: VerificationCheck[]; pass: boolean } {
  const has = (k: string) => bundle.files.some((f) => f.kind === k);
  const required =
    bundle.vehicle === 'moto'
      ? ['selfie', 'id_document', 'cnh_front', 'cnh_back', 'vehicle_doc', 'vehicle_photo', 'plate_photo']
      : ['selfie', 'id_document', 'bike_photo'];
  const checks: VerificationCheck[] = [];
  let pass = true;

  const docsOk = required.every(has);
  checks.push({
    id: 'gate:docs',
    label: 'Documentos obrigatórios enviados',
    status: docsOk ? 'pass' : 'fail',
    detail: docsOk ? undefined : 'Faltam documentos obrigatórios.',
  });
  if (!docsOk) pass = false;

  if (bundle.vehicle === 'moto') {
    const cat = (bundle.claimed.cnh?.category ?? '').toUpperCase();
    const catOk = /^A/.test(cat);
    checks.push({
      id: 'gate:cnh_categoria',
      label: 'Categoria da CNH habilita moto',
      status: catOk ? 'pass' : 'warn',
      detail: catOk ? `Categoria ${cat}.` : 'Categoria informada não habilita moto.',
    });
    if (!catOk) pass = false;

    const exp = parseBrDate(bundle.claimed.cnh?.expiresAt);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expOk = exp != null && exp >= today;
    checks.push({
      id: 'gate:cnh_validade',
      label: 'CNH dentro da validade',
      status: expOk ? 'pass' : exp == null ? 'skipped' : 'fail',
      detail: expOk ? undefined : exp == null ? 'Validade não informada.' : 'CNH vencida.',
    });
    if (!expOk) pass = false;

    const plateOk = (bundle.claimed.moto?.plate ?? '').replace(/\W/g, '').length >= 7;
    checks.push({
      id: 'gate:placa',
      label: 'Placa da moto informada',
      status: plateOk ? 'pass' : 'warn',
    });
    if (!plateOk) pass = false;
  }

  return { checks, pass };
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

    // Portão objetivo de auto-aprovação (documentos + validade/categoria/placa).
    const gate = buildGate(bundle);
    checks.unshift(...gate.checks);

    return {
      // Passou nos critérios verificáveis → aprova automático (provisório, ainda
      // vai para a mini-aprovação do admin). Senão, revisão manual.
      recommendation: gate.pass ? 'auto_approve' : 'manual_review',
      confidence: null,
      checks,
      provider: this.name,
      analyzedAt: new Date().toISOString(),
    };
  }
}

export const stubProvider: VerificationProvider = new StubProvider();
