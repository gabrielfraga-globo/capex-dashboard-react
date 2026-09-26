import { derivarPoStatus, PAYMENT_LEAD_DAYS } from "./types";
import type { CommitmentCuration } from "./types";
import { DELIVERY_TO_NF_DAYS, NF_TO_PAYMENT_DAYS } from "./stageConfig";

export type DecisionOrigin = "NOVO" | "LEGADO" | "NENHUMA";

export interface ReadDecisionResult {
  cashForecast: "CAIXA_EXERCICIO" | "CAIXA_PROXIMO_EXERCICIO" | "NAO_OCORRE" | null;
  cashYear: number | null;
  forecastPaymentDate: string | null;
  suggestedPaymentDate: string | null;
  decisionAgeDays: number | null;
  isAdjusted: boolean;
  isEarlyException: boolean;
  earlyByDays: number;
  confidence: "CONFIRMADO" | "PROVAVEL" | "INCERTO" | null;
  nonOccurrenceReason: "CANCELAR" | "REDUZIR" | "TROCAR_FORNECEDOR" | "ENCERRAR_SALDO" | "LEGADO" | null;
  nextAction: string | null;
  blocker: "APROVACAO" | "COTACAO_LICITACAO" | "CONTRATO" | "PROPOSTA_FORNECEDOR" | "PRAZO_FORNECEDOR" | "IMPORTACAO" | "ENTREGA_PARCIAL" | "RECEBIMENTO" | "NF" | "ORCAMENTO" | "SEM_BLOQUEIO" | null;
  priority: "ALTA" | "MEDIA" | "BAIXA" | null;
  paymentMode: "NORMAL" | "ANTECIPADO" | "MEDICAO_MENSAL" | null;
  physicalArrival: boolean | null;
  origin: DecisionOrigin;
  needsReview: boolean;
  deliveryInformed: string | null;
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toDayDiff(start: string, end: string): number {
  const left = new Date(`${start}T00:00:00Z`).getTime();
  const right = new Date(`${end}T00:00:00Z`).getTime();
  return Math.round((right - left) / (1000 * 60 * 60 * 24));
}

function parseDateValue(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  const asDate = new Date(normalized);
  if (Number.isFinite(asDate.getTime())) {
    return asDate.getTime();
  }

  const asDay = new Date(`${normalized}T00:00:00Z`);
  if (Number.isFinite(asDay.getTime())) {
    return asDay.getTime();
  }

  return null;
}

function diffDays(referenceDate: string, candidate: string | null): number | null {
  const ref = parseDateValue(referenceDate);
  const value = parseDateValue(candidate);
  if (ref == null || value == null) {
    return null;
  }

  return Math.max(0, Math.round((ref - value) / (1000 * 60 * 60 * 24)));
}

function deriveCashState(paymentDate: string | null, exerciseYear: number): { cashForecast: ReadDecisionResult["cashForecast"]; cashYear: number | null } {
  if (!paymentDate) {
    return { cashForecast: null, cashYear: null };
  }

  const limit = `${exerciseYear}-12-31`;
  const cashForecast = paymentDate <= limit ? "CAIXA_EXERCICIO" : "CAIXA_PROXIMO_EXERCICIO";
  return { cashForecast, cashYear: paymentDate <= limit ? exerciseYear : exerciseYear + 1 };
}

function toIsoDate(value: string | null | undefined): string | null {
  if (!value || !String(value).trim()) return null;
  const trimmed = String(value).trim();
  const withTime = trimmed.includes(" ") && !trimmed.includes("T") ? trimmed.replace(" ", "T") : trimmed;
  const parsed = new Date(withTime.includes("T") ? withTime : `${withTime}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function addDateDays(iso: string | null | undefined, days: number): string | null {
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function suggestPaymentDate(
  stage: unknown,
  line: Record<string, unknown> | null | undefined,
  referenceDate?: unknown
): string | null {
  const stageName = String(stage ?? "").toUpperCase();
  const refDate = (typeof referenceDate === "string" || referenceDate instanceof Date)
    ? toIsoDate(referenceDate instanceof Date ? referenceDate.toISOString().slice(0, 10) : referenceDate)
    : null;

  if (!refDate) {
    return null;
  }

  const rawDataPrometida = toIsoDate(typeof line?.dataPrometida === "string" ? line.dataPrometida : null)
    ?? toIsoDate(typeof line?.systemPromisedDate === "string" ? line.systemPromisedDate : null);

  if (stageName === "E4") {
    if (rawDataPrometida) {
      const promisedDate = new Date(`${rawDataPrometida}T00:00:00Z`);
      const referenceDateValue = new Date(`${refDate}T00:00:00Z`);
      const candidate = new Date(Math.max(promisedDate.getTime(), referenceDateValue.getTime()));
      const base = candidate.toISOString().slice(0, 10);
      return addDateDays(base, DELIVERY_TO_NF_DAYS + NF_TO_PAYMENT_DAYS);
    }

    return addDateDays(refDate, DELIVERY_TO_NF_DAYS + NF_TO_PAYMENT_DAYS);
  }

  if (stageName === "E5") {
    return addDateDays(refDate, DELIVERY_TO_NF_DAYS + NF_TO_PAYMENT_DAYS);
  }

  if (stageName === "E6") {
    return addDateDays(refDate, NF_TO_PAYMENT_DAYS);
  }

  return null;
}

function toLegacyForecast(poStatus: string | null, estimatedDeliveryDate: string | null, exerciseYear: number): {
  cashForecast: ReadDecisionResult["cashForecast"];
  confidence: ReadDecisionResult["confidence"];
  nonOccurrenceReason: ReadDecisionResult["nonOccurrenceReason"];
  forecastPaymentDate: string | null;
  cashYear: number | null;
} {
  const effectiveStatus = (poStatus !== "CANCELLED" && estimatedDeliveryDate)
    ? derivarPoStatus(estimatedDeliveryDate, exerciseYear)
    : poStatus;
  const forecastPaymentDate = estimatedDeliveryDate ? addDays(estimatedDeliveryDate, PAYMENT_LEAD_DAYS) : null;

  switch (effectiveStatus) {
    case "CONFIRMED":
      return { cashForecast: "CAIXA_EXERCICIO", confidence: null, nonOccurrenceReason: null, forecastPaymentDate, cashYear: exerciseYear };
    case "AT_RISK":
      return { cashForecast: "CAIXA_EXERCICIO", confidence: "INCERTO", nonOccurrenceReason: null, forecastPaymentDate, cashYear: exerciseYear };
    case "CARRYOVER":
      return { cashForecast: "CAIXA_PROXIMO_EXERCICIO", confidence: null, nonOccurrenceReason: null, forecastPaymentDate, cashYear: exerciseYear + 1 };
    case "CANCELLED":
      return { cashForecast: "NAO_OCORRE", confidence: null, nonOccurrenceReason: "LEGADO", forecastPaymentDate: null, cashYear: null };
    case "NO_VISIBILITY":
      return { cashForecast: null, confidence: null, nonOccurrenceReason: null, forecastPaymentDate: null, cashYear: null };
    default:
      return { cashForecast: null, confidence: null, nonOccurrenceReason: null, forecastPaymentDate: null, cashYear: null };
  }
}

export function readDecision(
  curation: CommitmentCuration | null,
  exerciseYear: number,
  referenceDate: string
): ReadDecisionResult {
  if (!curation) {
    return {
      cashForecast: null,
      cashYear: null,
      forecastPaymentDate: null,
      suggestedPaymentDate: null,
      decisionAgeDays: null,
      isAdjusted: false,
      isEarlyException: false,
      earlyByDays: 0,
      confidence: null,
      nonOccurrenceReason: null,
      nextAction: null,
      blocker: null,
      priority: null,
      paymentMode: null,
      physicalArrival: null,
      origin: "NENHUMA",
      needsReview: false,
      deliveryInformed: null,
    };
  }

  const hasNewDecisionData = curation.cashForecast != null || curation.forecastPaymentDate != null;
  const decisionAgeDays = diffDays(referenceDate, curation.decisionUpdatedAt ?? null);

  if (hasNewDecisionData) {
    const suggestedPaymentDate = curation.suggestedPaymentDate ?? null;
    const forecastPaymentDate = curation.forecastPaymentDate ?? null;
    const isAdjusted = Boolean(curation.paymentDateAdjusted ?? false);
    const isEarlyException = Boolean(suggestedPaymentDate && forecastPaymentDate && forecastPaymentDate < suggestedPaymentDate);
    const earlyByDays = suggestedPaymentDate && forecastPaymentDate && forecastPaymentDate < suggestedPaymentDate
      ? toDayDiff(forecastPaymentDate, suggestedPaymentDate)
      : 0;
    const derivedState = deriveCashState(forecastPaymentDate, exerciseYear);
    const cashForecast = curation.cashForecast === "NAO_OCORRE"
      ? "NAO_OCORRE"
      : derivedState.cashForecast;

    return {
      cashForecast,
      cashYear: curation.cashForecast === "NAO_OCORRE" ? null : derivedState.cashYear,
      forecastPaymentDate,
      suggestedPaymentDate,
      decisionAgeDays,
      isAdjusted,
      isEarlyException,
      earlyByDays,
      confidence: curation.confidence ?? null,
      nonOccurrenceReason: curation.nonOccurrenceReason ?? null,
      nextAction: curation.nextAction ?? null,
      blocker: curation.blocker ?? null,
      priority: curation.priority ?? null,
      paymentMode: curation.paymentMode ?? null,
      physicalArrival: curation.physicalArrival ?? null,
      origin: "NOVO",
      needsReview: false,
      deliveryInformed: curation.estimatedDeliveryDate ?? null,
    };
  }

  const legacy = toLegacyForecast(curation.poStatus, curation.estimatedDeliveryDate, exerciseYear);

  return {
    cashForecast: legacy.cashForecast,
    cashYear: legacy.cashYear,
    forecastPaymentDate: legacy.forecastPaymentDate,
    suggestedPaymentDate: null,
    decisionAgeDays,
    isAdjusted: false,
    isEarlyException: false,
    earlyByDays: 0,
    confidence: legacy.confidence,
    nonOccurrenceReason: legacy.nonOccurrenceReason,
    nextAction: curation.nextAction ?? null,
    blocker: curation.blocker ?? null,
    priority: curation.priority ?? null,
    paymentMode: curation.paymentMode ?? null,
    physicalArrival: curation.physicalArrival ?? null,
    origin: "LEGADO",
    needsReview: true,
    deliveryInformed: curation.estimatedDeliveryDate ?? null,
  };
}
