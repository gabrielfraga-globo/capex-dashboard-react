// ─────────────────────────────────────────────────────────────
// Enums e constantes
// ─────────────────────────────────────────────────────────────

export const PO_STATUS = ['CONFIRMED', 'AT_RISK', 'CANCELLED', 'NO_VISIBILITY'] as const;
export type PoStatus = (typeof PO_STATUS)[number];

export type CurationLevel = 'RC' | 'KEY';

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

// ─────────────────────────────────────────────────────────────
// Fonte oficial — gerada pelo process-data, nunca editada
// ─────────────────────────────────────────────────────────────

/** Linha bruta do compromissos_detalhados.csv, preservada para auditoria. */
export interface CommitmentSourceLine {
  idPpm: string;
  nomeLb: string;
  rubrica: string;
  reqCompra: string;
  ordemCompra: string | null;
  fornecedor: string;
  comprador: string;
  statusCompromisso: string;
  statusRc: string;
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
  rubrica: string;
  supplier: string;
  systemStatus: string;
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

/** Payload completo produzido pelo process-data. */
export interface CommitmentSourceBundle {
  generatedAt: string;
  exerciseYear: number;
  commitments: CommitmentSource[];
  rcGroups: RcGroup[];
  discardedLines: number;
  totals: { value: number; lines: number; keys: number; rcs: number };
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
  bgCurated: number;
  carryover: number;
  notCurated: number;
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
