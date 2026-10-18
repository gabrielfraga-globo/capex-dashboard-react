import type { AttentionKind } from "./types";

export const ATTENTION_LIMIT = 5;

export const ATTENTION_QUOTAS: Record<AttentionKind, number> = {
  ACIMA_ORCAMENTO: 2,
  RCS_EM_RISCO: 2,
  SALDO_PARADO: 1,
};

/** Ordem de prioridade: também desempata projetos presentes em mais de uma fonte. */
export const ATTENTION_PRIORITY: AttentionKind[] = ["ACIMA_ORCAMENTO", "RCS_EM_RISCO", "SALDO_PARADO"];

export const ATTENTION_ROUTES: Record<AttentionKind, string> = {
  ACIMA_ORCAMENTO: "/risco-caixa",
  RCS_EM_RISCO: "/radar",
  SALDO_PARADO: "/risco-caixa",
};
