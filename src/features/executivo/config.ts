import type { AttentionKind } from "./types";

export const ATTENTION_ROUTES: Record<AttentionKind, string> = {
  SEM_EMISSAO: "/risco-caixa",
  RCS_EM_RISCO: "/radar",
  SALDO_PARADO: "/risco-caixa",
};
