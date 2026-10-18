// ─────────────────────────────────────────────────────────────
// Enums e constantes
// ─────────────────────────────────────────────────────────────

import type { PaymentRecord } from "./payment.js";

export const PO_STATUS = ['CONFIRMED', 'AT_RISK', 'CARRYOVER', 'CANCELLED', 'NO_VISIBILITY'] as const;
export type PoStatus = (typeof PO_STATUS)[number];

export type CurationLevel = 'RC' | 'KEY';

export type CashForecast = 'CAIXA_EXERCICIO' | 'CAIXA_PROXIMO_EXERCICIO' | 'NAO_OCORRE';
export type DecisionConfidence = 'CONFIRMADO' | 'PROVAVEL' | 'INCERTO';
export type NonOccurrenceReason = 'CANCELAR' | 'REDUZIR' | 'TROCAR_FORNECEDOR' | 'ENCERRAR_SALDO' | 'LEGADO';
export type DecisionBlocker = 'APROVACAO' | 'COTACAO_LICITACAO' | 'CONTRATO' | 'PROPOSTA_FORNECEDOR' | 'PRAZO_FORNECEDOR' | 'IMPORTACAO' | 'ENTREGA_PARCIAL' | 'RECEBIMENTO' | 'NF' | 'ORCAMENTO' | 'SEM_BLOQUEIO';
export type PaymentMode = 'NORMAL' | 'ANTECIPADO' | 'MEDICAO_MENSAL';
export type PriorityLevel = 'ALTA' | 'MEDIA' | 'BAIXA';

export const CASH_FORECAST = ['NAO_OCORRE'] as const;
export const CONFIDENCE_LEVELS = ['CONFIRMADO', 'PROVAVEL', 'INCERTO'] as const;
export const NON_OCCURRENCE_REASONS = ['CANCELAR', 'REDUZIR', 'TROCAR_FORNECEDOR', 'ENCERRAR_SALDO', 'LEGADO'] as const;
export const BLOCKER_VALUES = ['APROVACAO', 'COTACAO_LICITACAO', 'CONTRATO', 'PROPOSTA_FORNECEDOR', 'PRAZO_FORNECEDOR', 'IMPORTACAO', 'ENTREGA_PARCIAL', 'RECEBIMENTO', 'NF', 'ORCAMENTO', 'SEM_BLOQUEIO'] as const;
export const PAYMENT_MODES = ['NORMAL', 'ANTECIPADO', 'MEDICAO_MENSAL'] as const;
export const PRIORITY_LEVELS = ['ALTA', 'MEDIA', 'BAIXA'] as const;
export const CRITICALITY_LEVELS = ['CRITICO', 'ATENCAO', 'NORMAL'] as const;

export type CashBucket =
  | 'CONFIRMED_IN_YEAR'
  | 'CARRYOVER'
  | 'CONFIRMED_NO_DATE'
  | 'AT_RISK'
  | 'NO_VISIBILITY'
  | 'CANCELLED'
  | 'NOT_CURATED';

export const PAYMENT_LEAD_DAYS = 30;
export const PENDING_OC = 'PENDING';

export const RADAR_CARD_BUCKETS = {
  bgTimes: "CONFIRMED_IN_YEAR",
  carryover: "CARRYOVER",
  notCurated: "NOT_CURATED",
} as const satisfies Record<string, CashBucket>;

export function derivarPoStatus(estimatedDeliveryDate: string | null, exerciseYear: number): PoStatus {
  if (!estimatedDeliveryDate) return "NO_VISIBILITY";

  const confirmedLimit = `${exerciseYear}-11-14`;
  const atRiskLimit = `${exerciseYear}-11-30`;
  if (estimatedDeliveryDate <= confirmedLimit) return "CONFIRMED";
  if (estimatedDeliveryDate <= atRiskLimit) return "AT_RISK";
  return "CARRYOVER";
}

// ─────────────────────────────────────────────────────────────
// Fonte oficial — gerada pelo process-data, nunca editada
// ─────────────────────────────────────────────────────────────

/** Linha bruta do compromissos_detalhados.csv, preservada para auditoria. */
export interface CommitmentSourceLine {
  idPpm: string;
  nomeLb: string;
  n4?: string;
  rubrica: string;
  reqCompra: string;
  ordemCompra: string | null;
  fornecedor: string;
  comprador: string;
  firstApprover?: string | null;
  commitmentCreatedAt?: string | null;   // ISO yyyy-mm-dd
  rcApprovedAt?: string | null;          // ISO yyyy-mm-dd
  /** gestor da plataforma (N4), não do projeto. */
  platformManager?: string | null;
  statusCompromisso: string;
  statusRc: string;
  requestDescription?: string;
  dataNecessidade: string | null;   // ISO yyyy-mm-dd
  dataPrometida: string | null;     // ISO yyyy-mm-dd
  valorCompromisso: number;
}

/** Compromisso consolidado no grão RC+OC+PPM. Unidade de ARMAZENAMENTO. */
export interface CommitmentSource {
  commitmentKey: string;            // RC:<rc>|OC:<oc|PENDING>|PPM:<ppm>
  rc: string;
  oc: string;                       // 'PENDING' quando ausente
  projectId: string;
  projectName: string;
  n4?: string;
  /** gestor da plataforma (N4), não do projeto. */
  platformManager?: string | null;
  rubrica: string;
  supplier: string;
  systemStatus: string;
  requestDescription?: string;
  systemPromisedDate: string | null;
  systemNeedDate: string | null;
  sourceValue: number;              // soma de ValorCompromisso (aceita negativo)
  lineCount: number;
  details: CommitmentSourceLine[];
}

/** Agrupamento por RC. Unidade de EDIÇÃO. */
export interface RcGroup {
  rc: string;
  commitmentKeys: string[];
  totalValue: number;
  projectIds: string[];
  suppliers: string[];
  ocs: string[];
  /** true quando a RC tem >1 PPM, >1 OC, >1 fornecedor, >1 status ou datas divergentes. */
  isHeterogeneous: boolean;
  heterogeneityReasons: string[];
  /** true quando as datas sistêmicas da RC cruzam 31/12 do exercício. */
  splitsExercise: boolean;
}

/** Seção opcional de pagamentos do Realizado_Detalhado.csv, adicionada ao bundle do radar. */
export interface PaymentsSection {
  generatedFrom: "Realizado_Detalhado.csv";
  inPayment: PaymentRecord[];
  totals: {
    paid: number;
    pending: number;
    inPaymentLines: number;
    inPaymentRcs: number;
    withoutRcLines: number;
    withoutRcValue: number;
  };
}

/** Payload completo produzido pelo process-data. */
export interface CommitmentSourceBundle {
  generatedAt: string;
  exerciseYear: number;
  commitments: CommitmentSource[];
  rcGroups: RcGroup[];
  discardedLines: number;
  totals: { value: number; lines: number; keys: number; rcs: number };
  payments?: PaymentsSection;
  projectActivity?: Array<{
    projectKey: string;
    lastPaymentAt: string | null;
    lastCommitmentCreatedAt: string | null;
    lastRcApprovedAt: string | null;
  }>;
}

// ─────────────────────────────────────────────────────────────
// Curadoria — escrita pelos gestores
// ─────────────────────────────────────────────────────────────

/** Estado de curadoria gravado pelo gestor para uma chave de compromisso. */
export interface CommitmentCuration {
  commitmentKey: string;
  estimatedDeliveryDate: string | null;   // ISO yyyy-mm-dd
  poStatus: PoStatus;
  notes: string | null;
  sourceValueAtCuration: number | null;
  curationLevel: CurationLevel;           // 'RC' = herdada | 'KEY' = específica
  inheritedFromKey: string | null;        // chave PENDING de origem
  updatedBy: string;
  updatedAt: string;                      // ISO timestamp

  // Campos opcionais da decisão do gestor, adicionados na Fase 3a.
  // cashForecast só pode ser gravado como 'NAO_OCORRE'; a intenção de caixa do exercício
  // e do próximo exercício é derivada de forecastPaymentDate.
  cashForecast?: CashForecast | null;
  suggestedPaymentDate?: string | null;    // ISO yyyy-mm-dd, sugestão da esteira
  forecastPaymentDate?: string | null;     // ISO yyyy-mm-dd, data efetiva da decisão
  paymentDateAdjusted?: boolean | null;    // true quando o gestor mudou a sugestão
  paymentExceptionReason?: string | null;  // opcional, até 120 caracteres
  confidence?: DecisionConfidence | null;
  nonOccurrenceReason?: NonOccurrenceReason | null;
  blocker?: DecisionBlocker | null;
  nextAction?: string | null;
  nextActionUpdatedAt?: string | null;    // ISO timestamp
  physicalArrival?: boolean | null;
  paymentMode?: PaymentMode | null;
  priority?: PriorityLevel | null;
  decisionStage?: string | null;
  decisionUpdatedAt?: string | null;      // ISO timestamp
  criticalityOverride?: "CRITICO" | "ATENCAO" | "NORMAL" | null;
  criticalityUpdatedBy?: string | null;
  criticalityUpdatedAt?: string | null;   // ISO timestamp
}

export type CurationMap = Record<string, CommitmentCuration>;

// ─────────────────────────────────────────────────────────────
// Visão — resultado do merge, existe apenas em memória
// ─────────────────────────────────────────────────────────────

/** Compromisso após o merge com a curadoria, pronto para exibição. */
export interface CommitmentView extends CommitmentSource {
  curation: CommitmentCuration | null;
  expectedPaymentDate: string | null;
  bucket: CashBucket;
  isCurated: boolean;
  /** valor do BI mudou desde a curadoria */
  isStale: boolean;
  staleDelta: number | null;
  /** curadoria herdada de uma chave PENDING que virou OC */
  requiresReview: boolean;
}

/** RC com suas chaves filhas mescladas, pronta para a tabela do Radar. */
export interface RcView extends RcGroup {
  commitments: CommitmentView[];
  /** curadoria efetiva da RC quando homogênea; null quando as filhas divergem */
  effectiveCuration: CommitmentCuration | null;
  hasMixedCuration: boolean;
  curatedValue: number;
  notCuratedValue: number;
  buckets: Record<CashBucket, number>;
}

/** Resumo consolidado do Radar para os KPIs. */
export interface RadarSummary {
  exerciseYear: number;
  totalCommitment: number;
  buckets: Record<CashBucket, number>;
  coverage: { curatedKeys: number; totalKeys: number; curatedValue: number; ratio: number };
  /** soma dos baldes bate com o total do BI */
  reconciles: boolean;
}

// ─────────────────────────────────────────────────────────────
// DTOs da API
// ─────────────────────────────────────────────────────────────

/** Corpo de requisição para curar uma chave individual. */
export interface CurationUpsertRequest {
  estimatedDeliveryDate: string | null;
  poStatus: PoStatus;
  notes: string | null;
  sourceValue: number;
  exerciseYear?: number;
  forecastPaymentDate?: string | null;
  suggestedPaymentDate?: string | null;
  paymentExceptionReason?: string | null;
  cashForecast?: CashForecast | null;
  nonOccurrenceReason?: NonOccurrenceReason | null;
  confidence?: DecisionConfidence | null;
  blocker?: DecisionBlocker | null;
  nextAction?: string | null;
  physicalArrival?: boolean | null;
  paymentMode?: PaymentMode | null;
  priority?: PriorityLevel | null;
  decisionStage?: string | null;
  criticalityOverride?: "CRITICO" | "ATENCAO" | "NORMAL" | null;
}

/** Corpo de requisição para curar uma RC e propagar para suas chaves filhas. */
export interface RcCurationUpsertRequest extends CurationUpsertRequest {
  /** chaves alvo com o sourceValue de cada uma, enviado pelo cliente */
  targets: Array<{ commitmentKey: string; sourceValue: number }>;
  /** false (padrão) preserva filhas com curationLevel = 'KEY' */
  overrideKeyLevel?: boolean;
}

/** Resposta da curadoria em nível de RC, com as chaves gravadas e preservadas. */
export interface RcCurationUpsertResponse {
  rc: string;
  written: string[];
  preserved: string[];   // filhas com curadoria própria, não sobrescritas
}

// ─────────────────────────────────────────────────────────────
// Saldo de projetos — fonte DAX "9-Saldo Projetos", arquivo próprio
// (public/data/saldo-projetos.json). Não altera nenhum contrato acima.
// ─────────────────────────────────────────────────────────────

/** Linha de Saldo_Projetos.csv normalizada. Grão N4×Aprovador×NomeLB×Rubrica, exercício único. */
export interface SaldoProjetoLinha {
  /** normalizeKey(n4)|normalizeKey(nomeLB) — igual a ProjetoBase.id */
  projectKey: string;
  n4: string;
  aprovador: string | null;
  nomeLB: string;
  rubrica: string;
  ano: number;
  orcamento: number;              // Orcamento_Cenarios (BGQ3)
  caixa: number;                  // Realizado_Conecta_Ano (pago + pendente)
  deltaCaixa: number;             // DeltaCaixa_2026
  compromissoTotal: number;       // Compromisso_Conecta
  compromissoValido: number;      // Compromisso valido (RC aprovada no exercício)
  saldoDisponivel: number;        // A emitir valido
  ultimaDataCompromisso: string | null; // ISO yyyy-mm-dd
  flagSaldo: boolean;             // Saldo Projeto = "✔️ Saldo"
  saldoPotencial: number;         // Valor Saldo (0 quando BLANK)
}

/** Totais de um recorte (carteira, projeto ou rubrica). Somas simples das linhas. */
export interface SaldoTotals {
  orcamento: number;
  caixa: number;
  deltaCaixa: number;
  compromissoTotal: number;
  compromissoValido: number;
  /** compromissoTotal − compromissoValido: RC aprovada antes do exercício, não abate o saldo */
  compromissoLegado: number;
  saldoDisponivel: number;
  saldoPotencial: number;
  projetos: number;               // projectKeys distintos
  projetosComSaldo: number;       // projectKeys distintos com saldoPotencial > 0
}

/** Verificação contra a carteira oficial. */
export interface SaldoReconcileCheck {
  label: "orcamento" | "caixa" | "compromisso";
  saldo: number;
  carteira: number;
  delta: number;
  ok: boolean;
}

/** Linha em que o valor do BI não bate com a própria definição da medida. */
export interface SaldoIdentityError {
  projectKey: string;
  rubrica: string;
  rule: "A_EMITIR_VALIDO" | "VALOR_SALDO";
  expected: number;
  actual: number;
}

/** Payload completo de public/data/saldo-projetos.json. */
export interface SaldoProjetosSection {
  schemaVersion: 1;
  generatedFrom: "Saldo_Projetos.csv";
  generatedAt: string;            // ISO, run do prebuild
  exerciseYear: number;           // Ano único da fonte
  dataReferencia: string;         // ISO, TODAY() do modelo na extração
  linhas: SaldoProjetoLinha[];
  totals: SaldoTotals;
  reconciliation: {
    /** checks.ok && identityErrors vazio && yearGuard.ok */
    ok: boolean;
    checks: SaldoReconcileCheck[];          // orcamento, caixa (bloqueiam)
    warnings: SaldoReconcileCheck[];        // compromisso (informativo)
    identityErrors: SaldoIdentityError[];   // no máximo 20, ordenados por |expected − actual|
    yearGuard: { ok: boolean; anosNaFonte: number[]; anoReferencia: number };
    orphanProjects: { count: number; saldoDisponivel: number; keys: string[] };
  };
  discardedLines: number;
}

/** Sinal executivo por recorte (V1, determinístico, derivado só de valores do BI). */
export type SaldoSignal =
  | "ESTOURO_CAIXA"        // caixa do ano já passou do orçamento
  | "SEM_ORCAMENTO"        // orçamento 0 (Filtro Saldo Projeto do BI = 0)
  | "COMPROMETIDO_ACIMA"   // caixa + compromisso válido > orçamento
  | "SALDO_PARADO"         // saldo potencial > 0 (regra do BI: 6 meses + R$ 50 mil)
  | "SALDO_RESIDUAL"       // flag de saldo do BI, mas abaixo de R$ 50 mil
  | "EM_EXECUCAO";

/** Visão agregada em memória para a tela e o widget. */
export interface SaldoRecorteView extends SaldoTotals {
  key: string;                    // projectKey ou rubrica
  label: string;
  aprovador: string | null;       // só no recorte por projeto
  ultimaDataCompromisso: string | null; // maior data entre as linhas
  linhasComFlag: number;
  pctCaixa: number | null;        // caixa / orcamento
  pctSaldo: number | null;        // saldoDisponivel / orcamento
  signal: SaldoSignal;
}
