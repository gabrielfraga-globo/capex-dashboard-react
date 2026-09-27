import type { CommitmentSourceBundle, CurationMap, DecisionConfidence, NonOccurrenceReason, RcCurationUpsertRequest } from "./types";
import { deriveStage, deriveSubState, deriveOwner, deriveDaysInStage, commitmentLineToStageInput } from "./stage";
import type { ReadDecisionResult } from "./decision";
import { readDecision, suggestPaymentDate } from "./decision";
import { DELIVERY_TO_NF_DAYS, NF_TO_PAYMENT_DAYS } from "./stageConfig";
import type { PaymentRecord } from "./payment";

/** Rótulos das etapas da esteira (RADAR_V1_COPILOT_PROMPT.md, seção 6.3). */
export const STAGE_LABELS: Record<string, string> = {
  E0: "Demanda sem RC",
  E1: "RC em aprovação",
  E2: "Cotação / OC a emitir",
  E3: "OC em aprovação",
  E4: "Aguardando entrega",
  E5: "Recebido, aguardando NF",
  E6: "NF em lançamento",
  E7: "Em pagamento",
  RESIDUAL: "Residual",
  DESCONHECIDA: "Não classificada",
};

export interface OperationalRow {
  rc: string;
  projectName: string;
  n4: string;
  platformManager: string | null;
  supplier: string;
  priority: "ALTA" | "MEDIA" | "BAIXA" | null;
  stage: string;
  value: number;
  lineCount: number;
  ocCount: number;
  daysInStage: number | null;
  subState: string;
  owner: string;
  /** área responsável da etapa (Suprimentos, Gestor da plataforma, Fornecedor…), sem o nome da pessoa */
  ownerArea: string;
  tooltip: {
    statusRc: string;
    statusCompromisso: string;
    oc: string;
    comprador: string;
    dataPrometida: string;
  };
  forecast: "CAIXA_EXERCICIO" | "CAIXA_PROXIMO_EXERCICIO" | "NAO_OCORRE" | null;
  forecastPaymentDate: string | null;
  suggestedPaymentDate: string | null;
  isEarlyException: boolean;
  confidence: "CONFIRMADO" | "PROVAVEL" | "INCERTO" | null;
  nextAction: string | null;
  isResidual: boolean;
  classification: "CAIXA_26" | "EM_RISCO" | "CAIXA_27" | "NAO_OCORRE";
  isClassificationConfirmed: boolean;
}

export interface PipelineCounters {
  byStage: Record<string, { count: number; value: number }>;
  noForecast: { count: number; value: number };
}

export function suggestClassification(row: OperationalRow, exerciseYear: number): "CAIXA_26" | "EM_RISCO" | "CAIXA_27" | "NAO_OCORRE" {
  const limit = `${exerciseYear}-12-31`;
  // a data sugerida decide o ano primeiro; só dentro do exercício a etapa decide entre Caixa 26 e Em risco
  if (!row.suggestedPaymentDate || row.suggestedPaymentDate > limit) return "CAIXA_27";
  if (row.stage === "E1" || row.stage === "E2" || row.stage === "E3" || row.subState === "E4_ATRASADO") {
    return "EM_RISCO";
  }
  return "CAIXA_26";
}

export function classificationFromDecision(decision: ReadDecisionResult, exerciseYear: number): "CAIXA_26" | "EM_RISCO" | "CAIXA_27" | "NAO_OCORRE" | null {
  if (decision.cashForecast === "NAO_OCORRE" || decision.nonOccurrenceReason === "LEGADO") return "NAO_OCORRE";
  if (decision.cashYear && decision.cashYear > exerciseYear) return "CAIXA_27";
  if (decision.confidence === "INCERTO") return "EM_RISCO";
  
  if (decision.origin === "LEGADO") {
    if (decision.cashForecast === "CAIXA_EXERCICIO") {
      return "CAIXA_26";
    }
    if (decision.cashForecast === "CAIXA_PROXIMO_EXERCICIO") return "CAIXA_27";
  }
  
  if (decision.origin === "NOVO") {
    if (decision.cashForecast === "CAIXA_EXERCICIO" || decision.cashYear === exerciseYear) return "CAIXA_26";
  }
  
  return null;
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function paymentFromDelivery(delivery: string): string {
  return addDays(delivery, DELIVERY_TO_NF_DAYS + NF_TO_PAYMENT_DAYS);
}

export function deliveryFromPayment(payment: string): string {
  return addDays(payment, -(DELIVERY_TO_NF_DAYS + NF_TO_PAYMENT_DAYS));
}

export function buildClassificationPayload(
  row: OperationalRow,
  estado: "CAIXA_26" | "EM_RISCO" | "CAIXA_27" | "NAO_OCORRE",
  options: { entregaEsperada?: string | null; motivo?: NonOccurrenceReason | null },
  exerciseYear: number
): Partial<RcCurationUpsertRequest> {
  if (estado === "NAO_OCORRE") {
    if (!options.motivo) throw new Error("Motivo de não ocorre é obrigatório.");
    return {
      exerciseYear,
      cashForecast: "NAO_OCORRE",
      forecastPaymentDate: null,
      suggestedPaymentDate: null,
      paymentExceptionReason: null,
      nonOccurrenceReason: options.motivo,
      confidence: null,
      blocker: null,
      nextAction: row.nextAction,
    };
  }

  const forecast = options.entregaEsperada ? paymentFromDelivery(options.entregaEsperada) : row.suggestedPaymentDate;
  
  if (estado === "CAIXA_27" && forecast && forecast <= `${exerciseYear}-12-31`) {
    throw new Error("Informe a entrega esperada");
  }

  const is27 = forecast && forecast > `${exerciseYear}-12-31`;
  const finalState = is27 ? "CAIXA_27" : estado;

  let confidence: DecisionConfidence = "CONFIRMADO";
  if (finalState === "EM_RISCO") confidence = "INCERTO";
  
  return {
    exerciseYear,
    cashForecast: null,
    nonOccurrenceReason: null,
    suggestedPaymentDate: row.suggestedPaymentDate,
    forecastPaymentDate: forecast,
    paymentExceptionReason: null,
    confidence,
    nextAction: row.nextAction,
  };
}

const STAGE_ORDER: Record<string, number> = {
  E0: 0,
  E1: 1,
  E2: 2,
  E3: 3,
  E4: 4,
  E5: 5,
  E6: 6,
  E7: 7,
  DESCONHECIDA: 99,
  RESIDUAL: 100,
};

function getStagePriority(stage: string): number {
  if (stage in STAGE_ORDER) return STAGE_ORDER[stage];
  return 101;
}

export function buildOperationalRows(
  bundle: CommitmentSourceBundle,
  curations: CurationMap,
  referenceDateStr: string
): OperationalRow[] {
  const referenceDate = new Date(referenceDateStr);
  const rows: OperationalRow[] = [];

  for (const group of bundle.rcGroups) {
    const rcCommitments = bundle.commitments.filter(c => c.rc === group.rc);
    if (rcCommitments.length === 0) continue;

    let dominantStage = "RESIDUAL";
    let dominantStagePriority = Number.POSITIVE_INFINITY;
    let dominantLineDetails: any = null;
    let dominantCommitment: any = null;
    let totalValue = 0;
    let lineCount = 0;
    const ocs = new Set<string>();

    for (const c of rcCommitments) {
      for (const line of c.details) {
        lineCount++;
        totalValue += line.valorCompromisso ?? 0;
        if (line.ordemCompra && line.ordemCompra !== "PENDING") {
          ocs.add(line.ordemCompra);
        }

        const input = commitmentLineToStageInput(line);
        const stage = deriveStage(input, { referenceDate });
        const priority = getStagePriority(stage);

        if (priority < dominantStagePriority) {
          dominantStagePriority = priority;
          dominantStage = stage;
          dominantLineDetails = input;
          dominantCommitment = c;
        }
      }
    }

    if (!dominantLineDetails) continue;

    // Curadoria da RC: prefere a chave da linha dominante; senão, a de maior valor entre as chaves da RC
    // (a curadoria pode ter sido gravada em outra OC da mesma RC, ou na chave OC:PENDING antes da OC existir).
    const keyOf = (c: { commitmentKey: string; oc: string; projectId: string }) => [
      c.commitmentKey,
      `RC:${group.rc}|OC:PENDING|PPM:${c.projectId}`,
    ];
    const candidates = [dominantCommitment, ...[...rcCommitments].sort((a, b) => b.sourceValue - a.sourceValue)];
    let curation = null as CurationMap[string] | null;
    for (const c of candidates) {
      for (const k of keyOf(c)) {
        if (curations[k]) { curation = curations[k]; break; }
      }
      if (curation) break;
    }
    const hasHighPriority = rcCommitments.some((c) => keyOf(c).some((k) => curations[k]?.priority === "ALTA"));

    const subState = deriveSubState(dominantLineDetails, dominantStage as any, { referenceDate });
    const ownerResult = deriveOwner(dominantStage, subState, dominantLineDetails);
    let ownerStr = ownerResult.displayName ?? ownerResult.name ?? "";
    if (ownerStr && ownerResult.area) {
      ownerStr += ` · ${ownerResult.area}`;
    } else if (!ownerStr) {
      ownerStr = ownerResult.area;
    }

    const daysInStage = deriveDaysInStage(dominantLineDetails, dominantStage as any, { referenceDate });

    const decision = readDecision(curation, bundle.exerciseYear, referenceDateStr);
    
    let suggested = suggestPaymentDate(dominantStage, dominantLineDetails, referenceDate);
    if (!suggested && decision.suggestedPaymentDate) {
       suggested = decision.suggestedPaymentDate;
    }

    const row: OperationalRow = {
      rc: group.rc,
      projectName: [...new Set(rcCommitments.map((c) => c.projectName).filter(Boolean))].join(", "),
      n4: [...new Set(rcCommitments.map((c) => c.n4).filter(Boolean))].join(", "),
      platformManager: [...new Set(rcCommitments.map((c) => c.platformManager).filter(Boolean))].join(", "),
      supplier: group.suppliers.join(", "),
      priority: hasHighPriority ? "ALTA" : curation?.priority ?? null,
      stage: dominantStage,
      value: totalValue,
      lineCount,
      ocCount: ocs.size,
      daysInStage,
      subState,
      owner: ownerStr,
      ownerArea: ownerResult.area ?? "",
      tooltip: {
        statusRc: dominantLineDetails.statusRc ?? "",
        statusCompromisso: dominantLineDetails.statusCompromisso ?? "",
        oc: dominantLineDetails.oc ?? "",
        comprador: dominantLineDetails.comprador ?? "",
        dataPrometida: dominantLineDetails.dataPrometida ?? "",
      },
      forecast: decision.cashForecast,
      forecastPaymentDate: decision.forecastPaymentDate,
      suggestedPaymentDate: suggested,
      isEarlyException: decision.isEarlyException,
      confidence: decision.confidence,
      nextAction: decision.nextAction,
      isResidual: dominantStage === "RESIDUAL",
      classification: "CAIXA_26",
      isClassificationConfirmed: false,
    };

    const fromDec = classificationFromDecision(decision, bundle.exerciseYear);
    if (fromDec) {
      row.classification = fromDec;
      row.isClassificationConfirmed = true;
    } else {
      row.classification = suggestClassification(row, bundle.exerciseYear);
    }

    rows.push(row);
  }

  rows.sort((a, b) => b.value - a.value);

  return rows;
}

export function buildPipelineCounters(
  rows: OperationalRow[],
  payments?: { inPayment: PaymentRecord[] }
): PipelineCounters {
  const counters: PipelineCounters = {
    byStage: {
      E1: { count: 0, value: 0 },
      E2: { count: 0, value: 0 },
      E3: { count: 0, value: 0 },
      E4: { count: 0, value: 0 },
      E5: { count: 0, value: 0 },
      E6: { count: 0, value: 0 },
      E7: { count: 0, value: 0 },
    },
    noForecast: { count: 0, value: 0 },
  };

  for (const row of rows) {
    if (row.stage.startsWith("E") && counters.byStage[row.stage]) {
      counters.byStage[row.stage].count += 1;
      counters.byStage[row.stage].value += row.value;
    }
    if (!row.forecast && !row.isResidual && row.stage !== "DESCONHECIDA") {
      counters.noForecast.count += 1;
      counters.noForecast.value += row.value;
    }
  }

  if (payments && payments.inPayment) {
    let e7Value = 0;
    const e7Rcs = new Set<string>();
    for (const p of payments.inPayment) {
      if (p.pending !== 0) {
        e7Value += p.pending;
        if (p.rc) e7Rcs.add(p.rc);
      }
    }
    counters.byStage["E7"] = {
      count: e7Rcs.size,
      value: e7Value,
    };
  }

  return counters;
}
