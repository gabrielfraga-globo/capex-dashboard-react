import type { CommitmentSourceBundle, CurationMap, DecisionConfidence, DecisionBlocker, PriorityLevel, NonOccurrenceReason, RcCurationUpsertRequest } from "./types";
import { deriveStage, deriveSubState, deriveOwner, deriveDaysInStage, commitmentLineToStageInput } from "./stage";
import { readDecision, suggestPaymentDate } from "./decision";
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
  supplier: string;
  priority: "ALTA" | "MEDIA" | "BAIXA" | null;
  stage: string;
  value: number;
  lineCount: number;
  ocCount: number;
  daysInStage: number | null;
  subState: string;
  owner: string;
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
}

export interface PipelineCounters {
  byStage: Record<string, { count: number; value: number }>;
  noForecast: { count: number; value: number };
}

export interface DecisionForm {
  naoOcorre: boolean;
  motivoNaoOcorre: NonOccurrenceReason | null;
  dataPagamento: string | null;
  motivoAntecipacao: string | null;
  confianca: DecisionConfidence | null;
  bloqueio: DecisionBlocker | null;
  proximaAcao: string | null;
  prioridade: PriorityLevel | null;
}

export function buildDecisionPayload(
  row: OperationalRow,
  form: DecisionForm,
  exerciseYear: number
): Partial<RcCurationUpsertRequest> {
  const nextAction = form.proximaAcao?.trim() ? form.proximaAcao.trim() : null;
  if (nextAction && nextAction.length > 80) {
    throw new Error("Próxima ação deve ter até 80 caracteres.");
  }
  if (form.naoOcorre) {
    if (!form.motivoNaoOcorre) {
      throw new Error("Motivo de não ocorre é obrigatório.");
    }
    return {
      exerciseYear,
      cashForecast: "NAO_OCORRE",
      // a API rejeita NAO_OCORRE junto com qualquer data (400)
      forecastPaymentDate: null,
      suggestedPaymentDate: null,
      paymentExceptionReason: null,
      nonOccurrenceReason: form.motivoNaoOcorre,
      confidence: form.confianca,
      blocker: form.bloqueio,
      nextAction,
      priority: form.prioridade,
    };
  }

  let paymentExceptionReason = null;
  if (form.dataPagamento && row.suggestedPaymentDate && form.dataPagamento < row.suggestedPaymentDate) {
    if (!form.motivoAntecipacao || form.motivoAntecipacao.trim() === "") {
      throw new Error("Motivo da antecipação é obrigatório.");
    }
    if (form.motivoAntecipacao.length > 120) {
      throw new Error("Motivo da antecipação deve ter até 120 caracteres.");
    }
    paymentExceptionReason = form.motivoAntecipacao.trim();
  }

  return {
    exerciseYear,
    cashForecast: null, // limpa um NAO_OCORRE anterior
    forecastPaymentDate: form.dataPagamento || null,
    suggestedPaymentDate: row.suggestedPaymentDate,
    paymentExceptionReason,
    nonOccurrenceReason: null,
    confidence: form.confianca,
    blocker: form.bloqueio,
    nextAction,
    priority: form.prioridade,
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

    rows.push({
      rc: group.rc,
      projectName: [...new Set(rcCommitments.map((c) => c.projectName).filter(Boolean))].join(", "),
      supplier: group.suppliers.join(", "),
      priority: hasHighPriority ? "ALTA" : curation?.priority ?? null,
      stage: dominantStage,
      value: totalValue,
      lineCount,
      ocCount: ocs.size,
      daysInStage,
      subState,
      owner: ownerStr,
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
    });
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
