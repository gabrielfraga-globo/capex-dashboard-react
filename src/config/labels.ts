import type { StatusRisco } from "../types";

/** Rótulos de tela centralizados. Trocar aqui muda nav, título e card juntos. */
export const LABELS = {
  riscoCaixaNav: "Auditoria",          // aba hoje "Risco de Caixa & Rubricas"
  riscoCaixaTitulo: "Auditoria",       // título da página /risco-caixa
  saldoParadoCard: "Auditoria de Saldos", // título do SaldoPotencialCard
  visaoDiretoriaNav: "Visão Diretoria",
  caixaAcumulado: "Caixa acumulado",
  caixaAcumuladoInfo: "Pago + em pagamento",
  acimaOrcamentoPlurianual: "Acima do orçamento plurianual",
  fechamentoEstimado: "Fechamento estimado",
  fechamentoEstimadoInfo:
    "Realizado + Em pagamento + Compromisso 26 + A emitir (por projeto). Fica acima do BG Gov pelo estouro dos projetos que já passaram do próprio BG.",
  bgVivoSimulado: "BG vivo simulado",
  caixaPrevisto26: "Caixa previsto 26",
  semOrcamento26: "Sem orçamento 26",
} as const;

/** Texto de tela de um status; o valor interno "Estouro" continua sendo a chave nos dados. */
export function rotuloStatus(status: StatusRisco): string {
  return status === "Estouro" ? LABELS.acimaOrcamentoPlurianual : status;
}
