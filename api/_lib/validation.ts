import type { PoStatus } from "../../src/features/radar/types.js";
import {
  PO_STATUS,
  CASH_FORECAST,
  CONFIDENCE_LEVELS,
  NON_OCCURRENCE_REASONS,
  BLOCKER_VALUES,
  PAYMENT_MODES,
  PRIORITY_LEVELS,
} from "../../src/features/radar/types.js";

export class ValidationError extends Error {
  statusCode = 400;
}

const KEY_PATTERN = /^RC:[^|]+\|OC:[^|]+\|PPM:[^|]+$/;
const NEW_DECISION_FIELDS = [
  "forecastPaymentDate",
  "suggestedPaymentDate",
  "paymentExceptionReason",
  "cashForecast",
  "nonOccurrenceReason",
  "confidence",
] as const;

export function validarChave(key: unknown): asserts key is string {
  if (typeof key !== "string" || !KEY_PATTERN.test(key)) {
    throw new ValidationError(`commitmentKey fora do padrão: ${String(key)}`);
  }
}

export function validarPoStatus(poStatus: unknown): PoStatus {
  if (typeof poStatus !== "string" || !(PO_STATUS as readonly string[]).includes(poStatus)) {
    throw new ValidationError(`poStatus inválido: ${String(poStatus)}`);
  }
  return poStatus as PoStatus;
}

export function validarExerciseYear(exerciseYear: unknown): number | undefined {
  if (exerciseYear == null) return undefined;
  if (typeof exerciseYear !== "number" || !Number.isInteger(exerciseYear) || exerciseYear <= 0) {
    throw new ValidationError("exerciseYear deve ser um inteiro positivo");
  }
  return exerciseYear;
}

function validateIsoDate(value: unknown, label: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new ValidationError(`${label} deve ser uma string no formato AAAA-MM-DD`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError(`${label} deve ser uma string no formato AAAA-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${label} deve ser uma data ISO válida`);
  }
  return value;
}

function hasAnyNewDecisionField(body: Record<string, unknown>): boolean {
  return NEW_DECISION_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(body, field));
}

type CorpoDeCuradoria = Partial<{
  estimatedDeliveryDate: unknown;
  poStatus: unknown;
  notes: unknown;
  exerciseYear: unknown;
  forecastPaymentDate: unknown;
  suggestedPaymentDate: unknown;
  paymentExceptionReason: unknown;
  cashForecast: unknown;
  nonOccurrenceReason: unknown;
  confidence: unknown;
  blocker: unknown;
  nextAction: unknown;
  physicalArrival: unknown;
  paymentMode: unknown;
  priority: unknown;
  decisionStage: unknown;
}>;

/** Regras comuns aos dois endpoints de escrita, antes de qualquer acesso ao banco. */
export function validarCorpoDeCuradoria(body: CorpoDeCuradoria): { poStatus?: PoStatus; exerciseYear?: number } {
  const hasNewDecisionFields = hasAnyNewDecisionField(body as Record<string, unknown>);
  const hasOperationalFields = Object.keys(body).some((key) =>
    ["blocker", "nextAction", "physicalArrival", "paymentMode", "priority", "decisionStage"].includes(key)
  );

  const poStatus = body.poStatus == null ? undefined : validarPoStatus(body.poStatus);

  if (poStatus === "CONFIRMED" && !body.estimatedDeliveryDate) {
    throw new ValidationError("CONFIRMED exige estimatedDeliveryDate");
  }
  if (body.estimatedDeliveryDate != null && typeof body.estimatedDeliveryDate !== "string") {
    throw new ValidationError("estimatedDeliveryDate deve ser uma string no formato AAAA-MM-DD");
  }
  if (body.notes != null && (typeof body.notes !== "string" || body.notes.length > 2000)) {
    throw new ValidationError("notes deve ter no máximo 2000 caracteres");
  }

  if (body.forecastPaymentDate != null) {
    const exerciseYear = validarExerciseYear(body.exerciseYear);
    if (exerciseYear == null) {
      throw new ValidationError("exerciseYear é obrigatório quando forecastPaymentDate está presente");
    }
    validateIsoDate(body.forecastPaymentDate, "forecastPaymentDate");
  }

  if (body.suggestedPaymentDate != null) {
    validateIsoDate(body.suggestedPaymentDate, "suggestedPaymentDate");
  }

  if (body.cashForecast === "NAO_OCORRE" && (body.forecastPaymentDate != null || body.suggestedPaymentDate != null)) {
    throw new ValidationError("cashForecast NAO_OCORRE não pode coexistir com forecastPaymentDate ou suggestedPaymentDate");
  }

  if (body.paymentExceptionReason != null) {
    if (typeof body.paymentExceptionReason !== "string" || body.paymentExceptionReason.length > 120) {
      throw new ValidationError("paymentExceptionReason deve ter no máximo 120 caracteres");
    }
  }

  if (body.cashForecast != null) {
    if (typeof body.cashForecast !== "string" || !(CASH_FORECAST as readonly string[]).includes(body.cashForecast)) {
      throw new ValidationError("cashForecast inválido. O valor aceito é 'NAO_OCORRE'");
    }
  }

  if (body.nonOccurrenceReason != null) {
    const value = String(body.nonOccurrenceReason);
    if (body.cashForecast !== "NAO_OCORRE") {
      throw new ValidationError("nonOccurrenceReason só pode ser informado quando cashForecast = 'NAO_OCORRE'");
    }
    if (!(NON_OCCURRENCE_REASONS as readonly string[]).includes(value)) {
      throw new ValidationError(`nonOccurrenceReason inválido: ${value}`);
    }
  }

  if (body.confidence != null) {
    const value = String(body.confidence);
    if (!(CONFIDENCE_LEVELS as readonly string[]).includes(value)) {
      throw new ValidationError(`confidence inválida: ${value}`);
    }
  }

  if (body.blocker != null) {
    const value = String(body.blocker);
    if (!(BLOCKER_VALUES as readonly string[]).includes(value)) {
      throw new ValidationError(`blocker inválido: ${value}`);
    }
  }

  if (body.nextAction != null) {
    if (typeof body.nextAction !== "string" || body.nextAction.length > 80) {
      throw new ValidationError("nextAction deve ter no máximo 80 caracteres");
    }
  }

  if (body.physicalArrival != null && typeof body.physicalArrival !== "boolean") {
    throw new ValidationError("physicalArrival deve ser booleano");
  }

  if (body.paymentMode != null) {
    const value = String(body.paymentMode);
    if (!(PAYMENT_MODES as readonly string[]).includes(value)) {
      throw new ValidationError(`paymentMode inválido: ${value}`);
    }
  }

  if (body.priority != null) {
    const value = String(body.priority);
    if (!(PRIORITY_LEVELS as readonly string[]).includes(value)) {
      throw new ValidationError(`priority inválido: ${value}`);
    }
  }

  if (body.decisionStage != null) {
    if (typeof body.decisionStage !== "string" || body.decisionStage.length > 255) {
      throw new ValidationError("decisionStage deve ter no máximo 255 caracteres");
    }
  }

  const exerciseYear = validarExerciseYear(body.exerciseYear);
  if (poStatus == null && !hasNewDecisionFields && !hasOperationalFields) {
    return { exerciseYear };
  }

  return { poStatus, exerciseYear };
}

export function validarSourceValue(sourceValue: unknown, label: string): number {
  if (typeof sourceValue !== "number" || !Number.isFinite(sourceValue)) {
    throw new ValidationError(`${label} deve ser um número finito`);
  }
  return sourceValue;
}
