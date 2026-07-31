// ============================================================================
// Tipagens centrais do domínio (carteira CAPEX — Plataformas de Produção)
// ============================================================================

export type Ano = "2026" | "2027";
export type Periodo = "2026" | "2027" | "Todos";

export type StatusRisco = "Estouro" | "Revisão de Caixa" | "Risco de Não Realização" | "Normal" | "Dados insuficientes";

export interface Gestor {
  n3: string;
  n4: string;
  nome: string;
  email: string;
}

/** Linha bruta de um projeto na aba "Orçamento" (por ano). */
export interface OrcamentoAnual {
  n4: string;
  nomeLB: string;
  meses2026: number[]; // jan..dez
  total2026: number;
  meses2027: number[]; // jan..mar
  total2027: number;
  totalGeral: number; // orçamento plurianual
}

/** Linha bruta de um projeto na aba "Realizado", por ano (2026 e/ou 2027). */
export interface RealizadoAnual {
  ano: Ano;
  n4: string;
  aprovador: string | null;
  nomeLB: string;
  orcamento: number;
  realizado: number;
  emPagamento: number;
  deltaCaixa: number;
  compromisso: number; // valor TOTAL do projeto, repetido em cada ano — não fracionado
  aEmitir: number;
}

/** Projeto consolidado (join de Orçamento + Realizado + Hierarquia), pronto para métricas. */
export interface ProjetoBase {
  id: string; // chave normalizada N4|NomeLB
  nome: string; // nome original, para exibição
  n4: string;
  n4Curta: string;
  gestor: string | null;
  gestorEmail: string | null;
  aprovador: string | null;

  orcamentoPlurianual: number | null; // da aba Orçamento (Total Geral)
  orcamento2026: number | null;
  orcamento2027: number | null;
  h1_2026: number | null;
  h2_2026: number | null;
  meses2026: number[] | null; // jan..dez, só disponível quando o projeto existe na aba Orçamento
  meses2027: number[] | null; // jan..mar

  realizado2026: number | null;
  emPagamento2026: number | null;
  realizado2027: number | null;
  emPagamento2027: number | null;

  compromisso: number | null; // deduplicado, valor único plurianual

  origemOrcamento: boolean; // existe na aba Orçamento?
  origemRealizado: boolean; // existe na aba Realizado?
}

/** Métricas calculadas para um projeto, já resolvidas para um período específico. */
export interface ProjetoMetricas extends ProjetoBase {
  periodo: Periodo;
  orcamentoPeriodo: number | null;
  realizadoPeriodo: number | null; // Realizado (sozinho, sem Em Pagamento) já resolvido para o período selecionado
  executado: number | null; // realizado + em pagamento (do período)
  pctExecucao: number | null;
  pctComprometimento: number | null;
  aEmitir: number | null;
  coberturaFinanceira: number | null; // (Executado + Emitido) / Orçamento — 0 a 1 (pode passar de 1)
  valorComprometidoTotal: number | null; // executado + compromisso
  pctOrcamentoPlurianual: number | null;
  desvioPlurianual: number | null;
  participacaoRisco: number | null; // preenchido depois, no nível da carteira
  riscoScore: number; // score proporcional 0-1 (ver metrics.ts::calculateRiskScore) — usado para ranquear ofensores
  status: StatusRisco;
  acaoRecomendada: string;
  ritmoNecessario: number | null; // valor restante / meses restantes do período
  planejadoAcumulado: number | null; // orçamento mensal acumulado até o mês corrente
  realizadoAcumulado: number | null; // Realizado até a data-base (sem Em Pagamento)
  executadoAcumulado: number | null; // Realizado + Em Pagamento até a data-base
  deltaYTD: number | null; // Executado Acumulado − Planejado Acumulado
}

export interface LinhaIgnorada {
  aba: string;
  motivo: string;
  contexto: string;
}

export interface ValidacaoResultado {
  metrica: string;
  valorCalculado: number;
  valorStatusReport: number | null;
  diferenca: number | null;
  situacao: "OK" | "Divergência" | "Sem referência";
  causaProvavel: string;
}

export interface RelatorioParsing {
  projetos: ProjetoBase[];
  gestores: Gestor[];
  linhasIgnoradas: LinhaIgnorada[];
  projetosSoOrcamento: string[];
  projetosSoRealizado: string[];
  dataBase: string;
  nomeArquivo: string;
  atualizadoEm: string;
  statusReportValores: Record<string, number>;
}

export interface FiltrosState {
  periodo: Periodo;
  plataforma: string | null;
  gestor: string | null;
  projeto: string | null;
  aprovador: string | null;
  status: StatusRisco | null;
  execucaoMin: number;
  execucaoMax: number;
  comprometimentoMin: number;
  comprometimentoMax: number;
  busca: string;
}
