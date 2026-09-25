import { PO_STATUS_ORDER } from "./status";
import { fornecedoresDaRc } from "./suppliers";
import type { RcView } from "./types";

export type SortKey = "rc" | "supplier" | "purchaseOrder" | "systemStatus" | "value" | "quantity" | "delivery" | "payment" | "status" | "notes";
export type SortDirection = "asc" | "desc";
type SortValue = string | number | Date | null;

export const NUMERIC_COLUMNS = new Set<SortKey>(["value", "quantity"]);

function dateValue(iso: string | null | undefined): Date | null {
  return iso ? new Date(`${iso}T00:00:00Z`) : null;
}

export const SORT_ACCESSORS: Record<SortKey, (rc: RcView) => SortValue> = {
  rc: (rc) => rc.rc,
  supplier: (rc) => fornecedoresDaRc(rc).join(" "),
  purchaseOrder: (rc) => Array.from(new Set(rc.commitments.map((commitment) => commitment.oc))).sort().join(" "),
  systemStatus: (rc) => Array.from(new Set(rc.commitments.map((commitment) => commitment.systemStatus))).sort().join(" "),
  value: (rc) => rc.totalValue,
  quantity: (rc) => rc.commitments.reduce((total, commitment) => total + commitment.lineCount, 0),
  delivery: (rc) => dateValue((rc.effectiveCuration ?? rc.commitments[0]?.curation)?.estimatedDeliveryDate),
  payment: (rc) => dateValue(rc.commitments[0]?.expectedPaymentDate),
  status: (rc) => {
    const status = (rc.effectiveCuration ?? rc.commitments[0]?.curation)?.poStatus;
    return status ? PO_STATUS_ORDER[status] : 5;
  },
  notes: (rc) => (rc.effectiveCuration ?? rc.commitments[0]?.curation)?.notes ?? "",
};

function compareValues(valueA: SortValue, valueB: SortValue): number {
  if (valueA === null && valueB === null) return 0;
  if (valueA === null) return 1;
  if (valueB === null) return -1;
  if (valueA instanceof Date && valueB instanceof Date) return valueA.getTime() - valueB.getTime();
  if (typeof valueA === "number" && typeof valueB === "number") return valueA - valueB;
  return String(valueA).localeCompare(String(valueB), "pt-BR", { sensitivity: "base" });
}

export function ordenarRcViews(rcViews: RcView[], key: SortKey, direction: SortDirection): RcView[] {
  const directionFactor = direction === "asc" ? 1 : -1;
  const accessor = SORT_ACCESSORS[key];
  return rcViews.map((rc, index) => ({ rc, index })).sort((a, b) => {
    const comparison = compareValues(accessor(a.rc), accessor(b.rc));
    return comparison === 0 ? a.index - b.index : comparison * directionFactor;
  }).map(({ rc }) => rc);
}
