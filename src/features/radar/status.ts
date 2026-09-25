import type { PoStatus } from "./types";

export const PO_STATUS_LABEL: Record<PoStatus, (exerciseYear: number) => string> = {
  CONFIRMED: (exerciseYear) => `Caixa ${String(exerciseYear).slice(-2)}`,
  AT_RISK: () => "Em risco",
  CARRYOVER: (exerciseYear) => `Caixa ${String(exerciseYear + 1).slice(-2)}`,
  CANCELLED: () => "Cancelado",
  NO_VISIBILITY: () => "Sem visibilidade",
};

export const PO_STATUS_ORDER: Record<PoStatus, number> = {
  CONFIRMED: 0,
  AT_RISK: 1,
  CARRYOVER: 2,
  CANCELLED: 3,
  NO_VISIBILITY: 4,
};

export function poStatusLabel(status: PoStatus, exerciseYear: number): string {
  return PO_STATUS_LABEL[status](exerciseYear);
}
