import type {
  CommitmentCuration,
  CashForecast,
  DecisionBlocker,
  DecisionConfidence,
  NonOccurrenceReason,
  PaymentMode,
  PoStatus,
  PriorityLevel,
} from "../../src/features/radar/types.js";
import { PAYMENT_LEAD_DAYS } from "../../src/features/radar/types.js";

export type CurationWriteMode = "DECISAO" | "LEGADO" | "OPERACIONAL";

const NEW_DECISION_FIELDS = [
  "forecastPaymentDate",
  "suggestedPaymentDate",
  "paymentExceptionReason",
  "cashForecast",
  "nonOccurrenceReason",
  "confidence",
] as const;

const OPERATIONAL_FIELDS = [
  "nextAction",
  "blocker",
  "priority",
  "paymentMode",
  "physicalArrival",
  "decisionStage",
  "criticalityOverride",
] as const;

export const CURATION_WRITE_COLUMN_WHITELIST = [
  "estimated_delivery_date",
  "po_status",
  "notes",
  "source_value_at_curation",
  "cash_forecast",
  "suggested_payment_date",
  "forecast_payment_date",
  "payment_date_adjusted",
  "payment_exception_reason",
  "confidence",
  "non_occurrence_reason",
  "blocker",
  "next_action",
  "next_action_updated_at",
  "physical_arrival",
  "payment_mode",
  "priority",
  "decision_stage",
  "decision_updated_at",
  "criticality_override",
  "criticality_updated_by",
  "criticality_updated_at",
] as const;

function paraDataIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  return text.length > 0 ? text.slice(0, 10) : null;
}

function paraTimestampIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function normalizeText(value: unknown, maxLength?: number): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (text.length === 0) return null;
  if (maxLength != null && text.length > maxLength) {
    return text.slice(0, maxLength);
  }
  return text;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return Boolean(value);
}

function hasAnyDecisionField(body: Record<string, unknown>): boolean {
  return NEW_DECISION_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(body, field));
}

function hasAnyOperationalField(body: Record<string, unknown>): boolean {
  return OPERATIONAL_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(body, field));
}

function addDays(dateIso: string, days: number): string {
  const value = new Date(`${dateIso}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function inferMode(body: Record<string, unknown>): CurationWriteMode {
  if (hasAnyDecisionField(body)) return "DECISAO";
  if (hasAnyOperationalField(body)) return "OPERACIONAL";
  return "LEGADO";
}

export function buildCurationWrite(
  body: Record<string, unknown>,
  exerciseYear: number,
  userEmail?: string
): { mode: CurationWriteMode; columns: Record<string, unknown> } {
  const mode = inferMode(body);
  const columns: Record<string, unknown> = {};
  const set = (column: string, value: unknown) => {
    columns[column] = value;
  };

  const applyOperationalFields = () => {
    for (const field of OPERATIONAL_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
      const value = body[field];
      if (field === "nextAction") {
        set("next_action", value == null ? null : normalizeText(value, 80));
        set("next_action_updated_at", value == null ? null : new Date().toISOString());
        continue;
      }
      if (field === "blocker") {
        set("blocker", value == null ? null : (String(value) as DecisionBlocker));
        continue;
      }
      if (field === "priority") {
        set("priority", value == null ? null : (String(value) as PriorityLevel));
        continue;
      }
      if (field === "paymentMode") {
        set("payment_mode", value == null ? null : (String(value) as PaymentMode));
        continue;
      }
      if (field === "physicalArrival") {
        set("physical_arrival", value == null ? null : normalizeBoolean(value));
        continue;
      }
      if (field === "decisionStage") {
        set("decision_stage", value == null ? null : normalizeText(value, 255));
        continue;
      }
      if (field === "criticalityOverride") {
        set("criticality_override", value == null ? null : String(value));
        if (value !== undefined && userEmail) {
          set("criticality_updated_by", userEmail);
          set("criticality_updated_at", new Date().toISOString());
        }
      }
    }
  };

  if (mode === "LEGADO") {
    if (Object.prototype.hasOwnProperty.call(body, "poStatus") && body.poStatus != null) {
      set("po_status", body.poStatus as PoStatus);
    }
    if (Object.prototype.hasOwnProperty.call(body, "estimatedDeliveryDate")) {
      set("estimated_delivery_date", paraDataIso(body.estimatedDeliveryDate));
    }
    if (Object.prototype.hasOwnProperty.call(body, "notes")) {
      set("notes", normalizeText(body.notes, 2000));
    }
    set("cash_forecast", null);
    set("suggested_payment_date", null);
    set("forecast_payment_date", null);
    set("payment_date_adjusted", null);
    set("payment_exception_reason", null);
    set("non_occurrence_reason", null);
    set("confidence", null);
    return { mode, columns };
  }

  if (mode === "OPERACIONAL") {
    applyOperationalFields();
    if (Object.prototype.hasOwnProperty.call(body, "poStatus") && body.poStatus != null) {
      set("po_status", body.poStatus as PoStatus);
    }
    if (Object.prototype.hasOwnProperty.call(body, "estimatedDeliveryDate")) {
      set("estimated_delivery_date", paraDataIso(body.estimatedDeliveryDate));
    }
    if (Object.prototype.hasOwnProperty.call(body, "notes")) {
      set("notes", normalizeText(body.notes, 2000));
    }
    return { mode, columns };
  }

  const cashForecast = body.cashForecast == null ? null : (String(body.cashForecast) as CashForecast);
  const forecastPaymentDate = paraDataIso(body.forecastPaymentDate);
  const suggestedPaymentDate = paraDataIso(body.suggestedPaymentDate);
  const paymentExceptionReason = body.paymentExceptionReason == null ? null : normalizeText(body.paymentExceptionReason, 120);
  const confidence = body.confidence == null ? null : (String(body.confidence) as DecisionConfidence);
  const nonOccurrenceReason = body.nonOccurrenceReason == null ? null : (String(body.nonOccurrenceReason) as NonOccurrenceReason);

  let nextEstimatedDeliveryDate: string | null = null;
  let nextPoStatus: PoStatus = "NO_VISIBILITY";

  if (cashForecast === "NAO_OCORRE") {
    nextPoStatus = "CANCELLED";
  } else if (forecastPaymentDate != null) {
    const limit = `${exerciseYear}-12-31`;
    if (forecastPaymentDate <= limit) {
      nextPoStatus = confidence === "INCERTO" ? "AT_RISK" : "CONFIRMED";
      nextEstimatedDeliveryDate = addDays(forecastPaymentDate, -PAYMENT_LEAD_DAYS);
    } else {
      nextPoStatus = "CARRYOVER";
      nextEstimatedDeliveryDate = addDays(forecastPaymentDate, -PAYMENT_LEAD_DAYS);
    }
  }

  set("po_status", nextPoStatus);
  set("estimated_delivery_date", nextEstimatedDeliveryDate);
  if (Object.prototype.hasOwnProperty.call(body, "notes")) {
    set("notes", normalizeText(body.notes, 2000));
  }
  if (Object.prototype.hasOwnProperty.call(body, "cashForecast")) {
    set("cash_forecast", cashForecast);
  }
  if (Object.prototype.hasOwnProperty.call(body, "nonOccurrenceReason")) {
    set("non_occurrence_reason", nonOccurrenceReason);
  }
  if (Object.prototype.hasOwnProperty.call(body, "suggestedPaymentDate")) {
    set("suggested_payment_date", suggestedPaymentDate);
  }
  if (Object.prototype.hasOwnProperty.call(body, "forecastPaymentDate")) {
    set("forecast_payment_date", forecastPaymentDate);
  }
  if (Object.prototype.hasOwnProperty.call(body, "forecastPaymentDate") || Object.prototype.hasOwnProperty.call(body, "suggestedPaymentDate")) {
    const paymentDateAdjusted =
      suggestedPaymentDate != null && forecastPaymentDate != null && suggestedPaymentDate !== forecastPaymentDate;
    set("payment_date_adjusted", paymentDateAdjusted);
  }
  if (Object.prototype.hasOwnProperty.call(body, "paymentExceptionReason")) {
    set("payment_exception_reason", paymentExceptionReason);
  }
  if (Object.prototype.hasOwnProperty.call(body, "confidence")) {
    set("confidence", confidence);
  }
  applyOperationalFields();
  set("decision_updated_at", new Date().toISOString());
  return { mode, columns };
}

/** updated_at é NOT NULL no banco; ausência indica linha corrompida, não "agora". */
function exigirTimestampIso(value: unknown, coluna: string): string {
  const iso = paraTimestampIso(value);
  if (iso == null) throw new Error(`${coluna} ausente na linha de curadoria`);
  return iso;
}

export function rowToCuration(row: Record<string, unknown>): CommitmentCuration {
  const curation: CommitmentCuration = {
    commitmentKey: String(row.commitment_key),
    estimatedDeliveryDate: paraDataIso(row.estimated_delivery_date),
    poStatus: row.po_status as PoStatus,
    notes: row.notes == null ? null : String(row.notes),
    sourceValueAtCuration:
      row.source_value_at_curation == null ? null : Number(row.source_value_at_curation),
    curationLevel: row.curation_level as CommitmentCuration["curationLevel"],
    inheritedFromKey: row.inherited_from_key == null ? null : String(row.inherited_from_key),
    updatedBy: String(row.updated_by),
    updatedAt: exigirTimestampIso(row.updated_at, "updated_at"),
    cashForecast: row.cash_forecast == null ? null : (String(row.cash_forecast) as CashForecast),
    suggestedPaymentDate: paraDataIso(row.suggested_payment_date),
    forecastPaymentDate: paraDataIso(row.forecast_payment_date),
    paymentDateAdjusted:
      row.payment_date_adjusted == null ? null : Boolean(row.payment_date_adjusted),
    paymentExceptionReason:
      row.payment_exception_reason == null ? null : String(row.payment_exception_reason),
    confidence: row.confidence == null ? null : (String(row.confidence) as DecisionConfidence),
    nonOccurrenceReason:
      row.non_occurrence_reason == null ? null : (String(row.non_occurrence_reason) as NonOccurrenceReason),
    blocker:
      row.blocker == null ? null : (String(row.blocker) as DecisionBlocker),
    nextAction: row.next_action == null ? null : String(row.next_action),
    nextActionUpdatedAt:
      row.next_action_updated_at == null ? null : paraTimestampIso(row.next_action_updated_at),
    physicalArrival:
      row.physical_arrival == null ? null : Boolean(row.physical_arrival),
    paymentMode:
      row.payment_mode == null ? null : (String(row.payment_mode) as PaymentMode),
    priority:
      row.priority == null ? null : (String(row.priority) as PriorityLevel),
    decisionStage: row.decision_stage == null ? null : String(row.decision_stage),
    decisionUpdatedAt: row.decision_updated_at == null ? null : paraTimestampIso(row.decision_updated_at),
    criticalityOverride: row.criticality_override == null ? null : (String(row.criticality_override) as CommitmentCuration["criticalityOverride"]),
    criticalityUpdatedBy: row.criticality_updated_by == null ? null : String(row.criticality_updated_by),
    criticalityUpdatedAt: row.criticality_updated_at == null ? null : paraTimestampIso(row.criticality_updated_at),
  };

  return curation;
}
