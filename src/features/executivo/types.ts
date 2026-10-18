export type AttentionKind = "ACIMA_ORCAMENTO" | "RCS_EM_RISCO" | "SALDO_PARADO";

/** Entrada normalizada pelos adaptadores de cada fonte. */
export interface AttentionSource {
  projectKey: string;
  projectName: string;
  owner: string | null;
  value: number; // sempre positivo
  mesesSemCompromisso?: number | null; // só SALDO_PARADO
}

export interface AttentionItem extends AttentionSource {
  kind: AttentionKind;
  detail: string;
  href: string;
}

export interface KpisExecutivos {
  orcamento: number;
  caixa: number;
  emPagamento: number;
  pctCaixa: number | null;
  desvioPlano: number | null;
  compromissoTotal: number;
  comprometido: number;
  pctComprometido: number | null;
  excesso: number;
  excessoSemLegado: number | null;
  folgaParada: number | null;
  projetosParados: number | null;
}
