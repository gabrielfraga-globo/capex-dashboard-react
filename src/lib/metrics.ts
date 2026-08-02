import type { Periodo, ProjetoBase, ProjetoMetricas, StatusRisco } from "../types";

const MESES_2026_TOTAL = 12;
const MESES_2027_TOTAL = 3; // a planilha só tem jan-mar/2027 orçado
// Trava M-1: análises executivas sempre usam o mês anterior fechado.
const _mesReal = new Date().getMonth() + 1; // 1-12
const _anoReal = new Date().getFullYear();
const MES_ATUAL = _mesReal === 1 ? 12 : _mesReal - 1;
const ANO_ATUAL = _mesReal === 1 ? _anoReal - 1 : _anoReal;
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

/** Quantos meses de um exercício já decorreram, com base na data real de hoje. */
function mesesDecorridos(ano: number, totalMesesDoExercicio: number): number {
  if (ANO_ATUAL > ano) return totalMesesDoExercicio; // exercício já encerrado
  if (ANO_ATUAL < ano) return 0; // exercício ainda não começou
  return Math.min(MES_ATUAL, totalMesesDoExercicio);
}

/** Planejado Acumulado: soma do orçamento mensal até o mês corrente. Quando o projeto não
 * tem o detalhe mensal (só existe na aba Realizado, não na aba Orçamento), aproxima por
 * regra de três sobre o total do ano — é uma aproximação documentada, não a exata. */
function planejadoAcumuladoAno(meses: number[] | null, totalOrcamentoAno: number | null, ano: number, totalMeses: number): number | null {
  const decorridos = mesesDecorridos(ano, totalMeses);
  if (meses && meses.length === totalMeses) {
    return meses.slice(0, decorridos).reduce((a, b) => a + b, 0);
  }
  if (totalOrcamentoAno !== null) {
    return totalOrcamentoAno * (decorridos / totalMeses);
  }
  return null;
}

/** Resolve orçamento/executado/etc. do período selecionado para um projeto. */
export function computeMetricas(p: ProjetoBase, periodo: Periodo): ProjetoMetricas {
  let orcamentoPeriodo: number | null;
  let realizado: number | null;
  let emPagamento: number | null;
  let mesesRestantes: number;
  let mesesTotais: number;
  let planejadoAcumulado: number | null;

  if (periodo === "2026") {
    orcamentoPeriodo = p.orcamento2026;
    realizado = p.realizado2026;
    emPagamento = p.emPagamento2026;
    mesesRestantes = Math.max(MESES_2026_TOTAL - mesesDecorridos(2026, MESES_2026_TOTAL), 0);
    mesesTotais = MESES_2026_TOTAL;
    planejadoAcumulado = planejadoAcumuladoAno(p.meses2026, p.orcamento2026, 2026, MESES_2026_TOTAL);
  } else if (periodo === "2027") {
    orcamentoPeriodo = p.orcamento2027;
    realizado = p.realizado2027;
    emPagamento = p.emPagamento2027;
    mesesRestantes = Math.max(MESES_2027_TOTAL - mesesDecorridos(2027, MESES_2027_TOTAL), 0);
    mesesTotais = MESES_2027_TOTAL;
    planejadoAcumulado = planejadoAcumuladoAno(p.meses2027, p.orcamento2027, 2027, MESES_2027_TOTAL);
  } else {
    // Todos os anos: usa o orçamento PLURIANUAL consolidado — nunca mistura granularidades.
    orcamentoPeriodo = p.orcamentoPlurianual;
    realizado = p.realizado2026 !== null || p.realizado2027 !== null ? (p.realizado2026 ?? 0) + (p.realizado2027 ?? 0) : null;
    emPagamento =
      p.emPagamento2026 !== null || p.emPagamento2027 !== null ? (p.emPagamento2026 ?? 0) + (p.emPagamento2027 ?? 0) : null;
    mesesRestantes =
      Math.max(MESES_2026_TOTAL - mesesDecorridos(2026, MESES_2026_TOTAL), 0) +
      Math.max(MESES_2027_TOTAL - mesesDecorridos(2027, MESES_2027_TOTAL), 0);
    mesesTotais = MESES_2026_TOTAL + MESES_2027_TOTAL;
    const plan2026 = planejadoAcumuladoAno(p.meses2026, p.orcamento2026, 2026, MESES_2026_TOTAL);
    const plan2027 = planejadoAcumuladoAno(p.meses2027, p.orcamento2027, 2027, MESES_2027_TOTAL);
    planejadoAcumulado = plan2026 !== null || plan2027 !== null ? (plan2026 ?? 0) + (plan2027 ?? 0) : null;
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

  // --- Delta YTD: o indicador executivo principal (Executado − Planejado) ---
  const realizadoAcumulado = realizado; // "Realizado" da fonte já é acumulado até a data-base
  const executadoAcumulado = realizado !== null || emPagamento !== null ? (realizado ?? 0) + (emPagamento ?? 0) : null;
  const deltaYTD = planejadoAcumulado !== null && executadoAcumulado !== null ? executadoAcumulado - planejadoAcumulado : null;

  // --- Estouro (regra revisada): só considera dinheiro REALMENTE gasto (Realizado + Em
  // Pagamento), plurianual, contra o orçamento plurianual — não conta mais o Emitido. ---
  const executadoPlurianualTotal =
    (p.realizado2026 ?? 0) + (p.emPagamento2026 ?? 0) + (p.realizado2027 ?? 0) + (p.emPagamento2027 ?? 0);
  const valorComprometidoTotal = executado !== null || compromisso !== null ? (executado ?? 0) + (compromisso ?? 0) : null;
  const pctOrcamentoPlurianual = safeDiv(valorComprometidoTotal, p.orcamentoPlurianual);
  const desvioPlurianual = p.orcamentoPlurianual !== null ? executadoPlurianualTotal - p.orcamentoPlurianual : null;

  const restante = aEmitir !== null ? Math.max(aEmitir, 0) : null;
  const ritmoNecessario = restante !== null ? restante / Math.max(mesesRestantes, 1) : null;

  const { status, acao } = classificarRisco(p, { orcamentoPeriodo, aEmitir, coberturaFinanceira, desvioPlurianual, mesesRestantes });

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
    planejadoAcumulado,
    realizadoAcumulado,
    executadoAcumulado,
    deltaYTD,
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
 * Classificação — 5 estados:
 *
 * 🔴 Estouro — Realizado + Em Pagamento (plurianual) > Orçamento Plurianual. Só dinheiro
 *    realmente gasto conta; Emitido (contrato) não é mais considerado nesta checagem.
 * 🔵 Revisar Caixa Ano — A Emitir negativo no período (mais foi gasto/emitido do
 *    que o orçamento do período), sem violar o plurianual. Indica potencial necessidade
 *    de antecipar ou postergar orçamento entre exercícios — não é alarme automático.
 * 🟠 Risco de Não Realização — Cobertura Financeira < 95% E faltam menos de 6 meses
 *    para o fim do exercício selecionado.
 * 🟢 Normal — todo o resto.
 * ⚪ Dados insuficientes — sem orçamento em nenhuma fonte.
 */
function classificarRisco(
  p: ProjetoBase,
  m: {
    orcamentoPeriodo: number | null;
    aEmitir: number | null;
    coberturaFinanceira: number | null;
    desvioPlurianual: number | null;
    mesesRestantes: number;
  }
): { status: StatusRisco; acao: string } {
  if (m.orcamentoPeriodo === null && p.orcamentoPlurianual === null) {
    return { status: "Dados insuficientes", acao: "Verificar cadastro do projeto." };
  }

  if (m.desvioPlurianual !== null && m.desvioPlurianual > 0) {
    return {
      status: "Estouro",
      acao: p.orcamentoPlurianual === 0 ? "Regularizar gasto sem orçamento aprovado." : "Revisar orçamento plurianual.",
    };
  }

  if (m.orcamentoPeriodo === null || m.orcamentoPeriodo <= 0 || m.coberturaFinanceira === null) {
    return { status: "Dados insuficientes", acao: "Cobertura financeira não calculável." };
  }

  if (m.aEmitir !== null && m.aEmitir < 0) {
    return { status: "Revisar Caixa Ano", acao: "Avaliar antecipação ou postergação de orçamento entre exercícios." };
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
