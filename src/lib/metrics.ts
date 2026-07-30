import type { Periodo, ProjetoBase, ProjetoMetricas, StatusRisco } from "../types";

const MESES_2026_TOTAL = 12;
const MESES_2027_TOTAL = 3; // a planilha só tem jan-mar/2027 orçado
const MES_ATUAL = new Date().getMonth() + 1; // 1-12, referência "hoje"
const JANELA_RISCO_MESES = 6; // "menos de 6 meses do fim do exercício"
const COBERTURA_MINIMA = 0.95; // "cobertura financeira < 95%"

function safeDiv(num: number | null, den: number | null): number | null {
  if (num === null || den === null || den === 0) return null;
  return num / den;
}

function clamp01(v: number | null): number {
  if (v === null || Number.isNaN(v)) return 0;
  return Math.min(Math.max(v, 0), 1);
}

/** Resolve orçamento/executado/etc. do período selecionado para um projeto. */
export function computeMetricas(p: ProjetoBase, periodo: Periodo): ProjetoMetricas {
  let orcamentoPeriodo: number | null;
  let realizado: number | null;
  let emPagamento: number | null;
  let mesesRestantes: number;
  let mesesTotais: number;

  if (periodo === "2026") {
    orcamentoPeriodo = p.orcamento2026;
    realizado = p.realizado2026;
    emPagamento = p.emPagamento2026;
    mesesRestantes = Math.max(MESES_2026_TOTAL - MES_ATUAL, 0);
    mesesTotais = MESES_2026_TOTAL;
  } else if (periodo === "2027") {
    orcamentoPeriodo = p.orcamento2027;
    realizado = p.realizado2027;
    emPagamento = p.emPagamento2027;
    mesesRestantes = MESES_2027_TOTAL;
    mesesTotais = MESES_2027_TOTAL;
  } else {
    // Todos os anos: usa o orçamento PLURIANUAL consolidado — nunca mistura granularidades.
    orcamentoPeriodo = p.orcamentoPlurianual;
    realizado = p.realizado2026 !== null || p.realizado2027 !== null ? (p.realizado2026 ?? 0) + (p.realizado2027 ?? 0) : null;
    emPagamento =
      p.emPagamento2026 !== null || p.emPagamento2027 !== null ? (p.emPagamento2026 ?? 0) + (p.emPagamento2027 ?? 0) : null;
    mesesRestantes = Math.max(MESES_2026_TOTAL - MES_ATUAL, 0) + MESES_2027_TOTAL;
    mesesTotais = MESES_2026_TOTAL + MESES_2027_TOTAL;
  }

  const executado = realizado !== null || emPagamento !== null ? (realizado ?? 0) + (emPagamento ?? 0) : null;
  const pctExecucao = safeDiv(executado, orcamentoPeriodo);
  const compromisso = p.compromisso; // "Emitido"
  const pctComprometimento = safeDiv(compromisso, orcamentoPeriodo);

  const aEmitir =
    orcamentoPeriodo !== null && compromisso !== null && executado !== null
      ? orcamentoPeriodo - compromisso - executado
      : null;

  const coberturaFinanceira =
    orcamentoPeriodo !== null && orcamentoPeriodo > 0 && executado !== null && compromisso !== null
      ? (executado + compromisso) / orcamentoPeriodo
      : null;

  const valorComprometidoTotal = executado !== null || compromisso !== null ? (executado ?? 0) + (compromisso ?? 0) : null;
  const pctOrcamentoPlurianual = safeDiv(valorComprometidoTotal, p.orcamentoPlurianual);
  const desvioPlurianual =
    valorComprometidoTotal !== null && p.orcamentoPlurianual !== null ? valorComprometidoTotal - p.orcamentoPlurianual : null;

  const restante = aEmitir !== null ? Math.max(aEmitir, 0) : null;
  const ritmoNecessario = restante !== null ? restante / Math.max(mesesRestantes, 1) : null;

  const { status, acao } = classificarRisco(p, { orcamentoPeriodo, coberturaFinanceira, desvioPlurianual, mesesRestantes });

  const riscoScore = calculateRiskScore({ status, orcamentoPeriodo, coberturaFinanceira, mesesRestantes, mesesTotais });

  return {
    ...p,
    periodo,
    orcamentoPeriodo,
    realizadoPeriodo: realizado,
    executado,
    pctExecucao,
    pctComprometimento,
    aEmitir,
    coberturaFinanceira,
    valorComprometidoTotal,
    pctOrcamentoPlurianual,
    desvioPlurianual,
    participacaoRisco: null,
    riscoScore,
    status,
    acaoRecomendada: acao,
    ritmoNecessario,
  };
}

function calculateRiskScore(m: {
  status: StatusRisco;
  orcamentoPeriodo: number | null;
  coberturaFinanceira: number | null;
  mesesRestantes: number;
  mesesTotais: number;
}): number {
  if (m.status === "Estouro") return 1;
  if (m.status !== "Risco de Não Realização" || m.orcamentoPeriodo === null || m.orcamentoPeriodo <= 0) return 0;

  const naoCoberto = clamp01(1 - (m.coberturaFinanceira ?? 1));
  const porte = Math.min(Math.log10(1 + m.orcamentoPeriodo) / 8, 1);
  const urgencia = 1 + (1 - m.mesesRestantes / Math.max(m.mesesTotais, 1));

  return Math.min((0.7 * naoCoberto + 0.3 * porte) * urgencia, 1);
}

/**
 * Classificação simplificada — apenas 4 estados:
 *
 * 🔴 Estouro — Executado + Emitido > Orçamento Plurianual. Sempre prioridade máxima.
 * 🟠 Risco de Não Realização — Cobertura Financeira < 95% E faltam menos de 6 meses
 *    para o fim do exercício selecionado. Fora dessa janela de tempo, mesmo uma
 *    cobertura baixa ainda é considerada normal (há tempo hábil para resolver).
 * 🟢 Normal — todo o resto, incluindo cobertura baixa com tempo hábil e cobertura
 *    acima de 100% (execução/emissão adiantada).
 * ⚪ Dados insuficientes — sem orçamento em nenhuma fonte.
 */
function classificarRisco(
  p: ProjetoBase,
  m: { orcamentoPeriodo: number | null; coberturaFinanceira: number | null; desvioPlurianual: number | null; mesesRestantes: number }
): { status: StatusRisco; acao: string } {
  if (m.orcamentoPeriodo === null && p.orcamentoPlurianual === null) {
    return { status: "Dados insuficientes", acao: "Verificar cadastro do projeto." };
  }

  if (m.desvioPlurianual !== null && m.desvioPlurianual > 0) {
    return {
      status: "Estouro",
      acao: p.orcamentoPlurianual === 0 ? "Regularizar emissão sem orçamento aprovado." : "Revisar orçamento plurianual.",
    };
  }

  if (m.orcamentoPeriodo === null || m.orcamentoPeriodo <= 0 || m.coberturaFinanceira === null) {
    return { status: "Dados insuficientes", acao: "Cobertura financeira não calculável." };
  }

  if (m.coberturaFinanceira < COBERTURA_MINIMA && m.mesesRestantes < JANELA_RISCO_MESES) {
    return { status: "Risco de Não Realização", acao: "Acelerar emissão e execução — pouco tempo restante." };
  }

  return { status: "Normal", acao: "Nenhuma ação necessária." };
}

export function withParticipacaoRisco(lista: ProjetoMetricas[]): ProjetoMetricas[] {
  const riscoTotal = lista.reduce((acc, p) => acc + p.riscoScore, 0);
  return lista.map((p) => ({
    ...p,
    participacaoRisco: riscoTotal > 0 ? p.riscoScore / riscoTotal : null,
  }));
}
