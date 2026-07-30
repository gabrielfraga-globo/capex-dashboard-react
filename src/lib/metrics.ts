import type { Periodo, ProjetoBase, ProjetoMetricas, StatusRisco } from "../types";

const MESES_2026_TOTAL = 12;
const MESES_2027_TOTAL = 3; // a planilha só tem jan-mar/2027 orçado
const MES_ATUAL = new Date().getMonth() + 1; // 1-12, referência "hoje" para ritmo necessário

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
    mesesRestantes = Math.max(MESES_2026_TOTAL - MES_ATUAL, 1);
    mesesTotais = MESES_2026_TOTAL;
  } else if (periodo === "2027") {
    orcamentoPeriodo = p.orcamento2027;
    realizado = p.realizado2027;
    emPagamento = p.emPagamento2027;
    mesesRestantes = MESES_2027_TOTAL;
    mesesTotais = MESES_2027_TOTAL;
  } else {
    // Todos os anos: usa o orçamento PLURIANUAL consolidado (aba Orçamento) — nunca mistura
    // com a soma dos orçamentos anuais da aba Realizado.
    orcamentoPeriodo = p.orcamentoPlurianual;
    realizado = p.realizado2026 !== null || p.realizado2027 !== null ? (p.realizado2026 ?? 0) + (p.realizado2027 ?? 0) : null;
    emPagamento =
      p.emPagamento2026 !== null || p.emPagamento2027 !== null ? (p.emPagamento2026 ?? 0) + (p.emPagamento2027 ?? 0) : null;
    mesesRestantes = Math.max(MESES_2026_TOTAL - MES_ATUAL, 1) + MESES_2027_TOTAL;
    mesesTotais = MESES_2026_TOTAL + MESES_2027_TOTAL;
  }

  const executado = realizado !== null || emPagamento !== null ? (realizado ?? 0) + (emPagamento ?? 0) : null;
  const pctExecucao = safeDiv(executado, orcamentoPeriodo);
  const compromisso = p.compromisso; // "Emitido" — valor único, plurianual, nunca fracionado
  const pctComprometimento = safeDiv(compromisso, orcamentoPeriodo);

  // A Emitir = Orçamento − Executado − Emitido (confirmado contra a coluna nativa da planilha-fonte)
  const aEmitir =
    orcamentoPeriodo !== null && compromisso !== null && executado !== null
      ? orcamentoPeriodo - compromisso - executado
      : null;

  // Cobertura Financeira = (Executado + Emitido) / Orçamento — nova ótica de risco:
  // não é "estourou ou não", é "quanto do orçamento já entrou no fluxo financeiro".
  const coberturaFinanceira =
    orcamentoPeriodo !== null && orcamentoPeriodo > 0 && executado !== null && compromisso !== null
      ? (executado + compromisso) / orcamentoPeriodo
      : null;

  const valorComprometidoTotal = executado !== null || compromisso !== null ? (executado ?? 0) + (compromisso ?? 0) : null;
  const pctOrcamentoPlurianual = safeDiv(valorComprometidoTotal, p.orcamentoPlurianual);
  const desvioPlurianual =
    valorComprometidoTotal !== null && p.orcamentoPlurianual !== null ? valorComprometidoTotal - p.orcamentoPlurianual : null;

  const restante = aEmitir !== null ? Math.max(aEmitir, 0) : null;
  const ritmoNecessario = restante !== null ? restante / mesesRestantes : null;

  const { status, acao } = classificarRisco(p, { orcamentoPeriodo, aEmitir, desvioPlurianual });

  const riscoScore = calculateRiskScore({
    status, orcamentoPeriodo, aEmitir, mesesRestantes, mesesTotais,
  });

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
    participacaoRisco: null, // preenchido depois, no agregado da carteira
    riscoScore,
    status,
    acaoRecomendada: acao,
    ritmoNecessario,
  };
}

/**
 * Score de risco PROPORCIONAL (0 a 1) — ranqueia "ofensores" pela ótica de Cobertura
 * Financeira (não mais por valor absoluto). Estouro sempre recebe score máximo.
 */
function calculateRiskScore(m: {
  status: StatusRisco;
  orcamentoPeriodo: number | null;
  aEmitir: number | null;
  mesesRestantes: number;
  mesesTotais: number;
}): number {
  if (m.status === "Estouro") return 1;
  if (m.orcamentoPeriodo === null || m.orcamentoPeriodo <= 0) return 0;

  const pctAEmitir = clamp01(safeDiv(m.aEmitir, m.orcamentoPeriodo)); // negativo vira 0 (não é risco de não-realização)
  const porte = Math.min(Math.log10(1 + m.orcamentoPeriodo) / 8, 1);
  const fatorUrgencia = 1 + (1 - m.mesesRestantes / Math.max(m.mesesTotais, 1));

  const score = (0.65 * pctAEmitir + 0.20 * porte) * fatorUrgencia + (m.status === "Revisão Financeira" ? 0.1 : 0);
  return Math.min(score, 1);
}

/**
 * Nova classificação — ótica de Cobertura Financeira em vez de "estourou / não estourou":
 *
 * 1. 🔴 Estouro — Executado + Emitido > Orçamento PLURIANUAL (sempre a prioridade máxima;
 *    é o único caso onde o orçamento aprovado para o projeto inteiro foi excedido).
 * 2. 🔵 Revisão Financeira — A Emitir negativo no PERÍODO (mais foi executado/emitido do
 *    que o orçamento do período, mas sem violar o plurianual). NÃO é automaticamente
 *    tratado como problema — pode ser timing, replanejamento ou apropriação futura.
 * 3. 🟠 Risco de Não Realização — mais de 30% do orçamento do período ainda sem cobertura
 *    financeira (nem executado, nem emitido).
 * 4. 🟡 Atenção — entre 10% e 30% do orçamento sem cobertura.
 * 5. 🟢 Coberto — 10% ou menos do orçamento sem cobertura.
 */
function classificarRisco(
  p: ProjetoBase,
  m: { orcamentoPeriodo: number | null; aEmitir: number | null; desvioPlurianual: number | null }
): { status: StatusRisco; acao: string } {
  if (m.orcamentoPeriodo === null && p.orcamentoPlurianual === null) {
    return { status: "Dados insuficientes", acao: "Verificar cadastro do projeto (sem orçamento em nenhuma fonte)." };
  }

  if (m.desvioPlurianual !== null && m.desvioPlurianual > 0) {
    return {
      status: "Estouro",
      acao: p.orcamentoPlurianual === 0
        ? "Regularizar emissão sem cobertura orçamentária (orçamento aprovado = zero)."
        : "Revisar orçamento plurianual — valor já emitido/executado excede o teto aprovado.",
    };
  }

  if (m.orcamentoPeriodo === null || m.orcamentoPeriodo <= 0 || m.aEmitir === null) {
    return { status: "Dados insuficientes", acao: "Cobertura financeira não calculável para este período." };
  }

  if (m.aEmitir < 0) {
    return { status: "Revisão Financeira", acao: "Analisar contexto do saldo negativo (ajuste, replanejamento ou timing de apropriação)." };
  }

  const pctAEmitir = m.aEmitir / m.orcamentoPeriodo;

  if (pctAEmitir > 0.30) {
    return { status: "Risco de Não Realização", acao: "Acelerar emissão e execução — mais de 30% do orçamento ainda sem cobertura financeira." };
  }
  if (pctAEmitir > 0.10) {
    return { status: "Atenção", acao: "Acompanhar de perto — entre 10% e 30% do orçamento ainda sem cobertura financeira." };
  }
  return { status: "Coberto", acao: "Nenhuma ação necessária — orçamento praticamente coberto." };
}

/** Preenche "participação no risco" no nível da carteira filtrada, usando o score proporcional. */
export function withParticipacaoRisco(lista: ProjetoMetricas[]): ProjetoMetricas[] {
  const riscoTotal = lista.reduce((acc, p) => acc + p.riscoScore, 0);
  return lista.map((p) => ({
    ...p,
    participacaoRisco: riscoTotal > 0 ? p.riscoScore / riscoTotal : null,
  }));
}
