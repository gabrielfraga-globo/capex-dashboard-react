/** Nomes exatos das colunas de Saldo_Projetos.csv (= aliases em saldo_projetos.dax). */
export const SALDO_COLUMNS = {
  n4: "N4",
  aprovador: "1º Aprovador",
  nomeLB: "NomeLB",
  ano: "Ano",
  rubrica: "Rubrica",
  orcamento: "Orcamento_Cenarios",
  caixa: "Realizado_Conecta_Ano",
  deltaCaixa: "DeltaCaixa_2026",
  compromissoTotal: "Compromisso_Conecta",
  compromissoValido: "Compromisso_Valido",
  saldoDisponivel: "A_Emitir_Valido",
  ultimaDataCompromisso: "Ultima_Data_Compromisso",
  flagSaldo: "Saldo_Projeto",
  saldoPotencial: "Valor_Saldo",
  dataReferencia: "Data_Referencia",
} as const;

/** Espelho das regras do BI. Usado SÓ para verificar identidades, nunca para recalcular. */
export const SALDO_BI_RULES = { corteValorSaldo: 50_000, janelaMeses: 6 } as const;

export const SALDO_RECONCILE_TOLERANCE = 1;      // R$, contra a carteira oficial
export const SALDO_IDENTITY_TOLERANCE = 0.02;    // R$, por linha (DeltaCaixa é arredondado)
export const SALDO_SIGNAL_TOLERANCE = 1_000;     // R$, para negativos de sinal
export const SALDO_LEGADO_MATERIAL = 50_000;     // R$, a partir do qual a nota de premissa (legado) aparece

/** Texto do critério de saldo parado do BI, usado na home e nos insights. */
export const SALDO_PARADO_CRITERIO_BI = "sem compromisso aprovado há 6+ meses (critério BI)";
