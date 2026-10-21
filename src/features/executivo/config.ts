import type { AttentionKind } from "./types";

export const ATTENTION_ROUTES: Record<AttentionKind, string> = {
  ACIMA_ORCAMENTO: "/risco-caixa",
  RCS_EM_RISCO: "/radar",
  SALDO_PARADO: "/risco-caixa",
};
