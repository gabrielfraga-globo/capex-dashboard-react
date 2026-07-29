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
    // Todos os anos: consolida 2026+2027 (aditivo — Compromisso NÃO é somado aqui, é tratado à parte)
    orcamentoPeriodo =
      p.orcamento2026 !== null || p.orcamento2027 !== null ? (p.orcamento2026 ?? 0) + (p.orcamento2027 ?? 0) : null;
    realizado = p.realizado2026 !== null || p.realizado2027 !== null ? (p.realizado2026 ?? 0) + (p.realizado2027 ?? 0) : null;
    emPagamento =
      p.emPagamento2026 !== null || p.emPagamento2027 !== null ? (p.emPagamento2026 ?? 0) + (p.emPagamento2027 ?? 0) : null;
    mesesRestantes = Math.max(MESES_2026_TOTAL - MES_ATUAL, 1) + MESES_2027_TOTAL;
    mesesTotais = MESES_2026_TOTAL + MESES_2027_TOTAL;
  }

  const executado = realizado !== null || emPagamento !== null ? (realizado ?? 0) + (emPagamento ?? 0) : null;
  const pctExecucao = safeDiv(executado, orcamentoPeriodo);
  const compromisso = p.compromisso; // valor único, plurianual, nunca fracionado
  const pctComprometimento = safeDiv(compromisso, orcamentoPeriodo);

  // --- CORREÇÃO (regra da área de Performance): ---
  // A Emitir = Orçamento − Compromisso − Realizado (não subtrai Em Pagamento).
  const aEmitir =
    orcamentoPeriodo !== null && compromisso !== null && realizado !== null
      ? orcamentoPeriodo - compromisso - realizado
      : null;
  const faltaComprometer = orcamentoPeriodo !== null && compromisso !== null ? Math.max(orcamentoPeriodo - compromisso, 0) : null;

  const valorComprometidoTotal = executado !== null || compromisso !== null ? (executado ?? 0) + (compromisso ?? 0) : null;
  const pctOrcamentoPlurianual = safeDiv(valorComprometidoTotal, p.orcamentoPlurianual);
  const desvioPlurianual =
    valorComprometidoTotal !== null && p.orcamentoPlurianual !== null ? valorComprometidoTotal - p.orcamentoPlurianual : null;

  const restante = aEmitir !== null ? Math.max(aEmitir, 0) : null;
  const ritmoNecessario = restante !== null ? restante / mesesRestantes : null;

  const { status, acao } = classificarRisco(p, {
    orcamentoPeriodo,
    pctExecucao,
    pctComprometimento,
    faltaComprometer,
    valorComprometidoTotal,
    desvioPlurianual,
  });

  const riscoScore = calculateRiskScore({
    status, orcamentoPeriodo, pctExecucao, pctComprometimento, aEmitir, mesesRestantes, mesesTotais,
  });

  return {
    ...p,
    periodo,
    orcamentoPeriodo,
    realizadoPeriodo: realizado,
    executado,
    pctExecucao,
    pctComprometimento,
    faltaComprometer,
    aEmitir,
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
 * Score de risco PROPORCIONAL (0 a 1) — corrige o problema de ranquear ofensores só por
 * valor absoluto. Um projeto de R$100M com R$8M a emitir é MENOS arriscado que um de
 * R$10M com R$8M a emitir, ainda que o valor absoluto seja igual.
 *
 * Componentes (todos proporcionais, não em R$):
 *  - % não comprometido (1 - %Comprometimento)      peso 0.30
 *  - % não executado (1 - %Execução)                peso 0.25
 *  - % do orçamento ainda "a emitir"                 peso 0.25
 *  - porte relativo do orçamento do projeto          peso 0.20 (ainda dá algum peso a
 *                                                       projetos grandes, sem deixá-los dominar)
 * Multiplicado por um fator de urgência temporal: quanto mais perto do fim do período,
 * maior o peso do que ainda falta resolver (mesmo %, mais tarde no ano = mais grave).
 * Estouro sempre recebe score máximo (1.0) — é o risco mais severo por definição.
 */
function calculateRiskScore(m: {
  status: StatusRisco;
  orcamentoPeriodo: number | null;
  pctExecucao: number | null;
  pctComprometimento: number | null;
  aEmitir: number | null;
  mesesRestantes: number;
  mesesTotais: number;
}): number {
  if (m.status === "Estouro") return 1;
  if (m.orcamentoPeriodo === null || m.orcamentoPeriodo <= 0) return 0;

  const naoComprometido = 1 - clamp01(m.pctComprometimento);
  const naoExecutado = 1 - clamp01(m.pctExecucao);
  const pctAEmitir = clamp01(safeDiv(m.aEmitir, m.orcamentoPeriodo));
  // porte relativo: log-scale para não deixar 1 projeto gigante dominar tudo, mas ainda contar
  const porte = Math.min(Math.log10(1 + m.orcamentoPeriodo) / 8, 1); // ~R$100M → log10(1e8)/8 ≈ 1

  const fatorUrgencia = 1 + (1 - m.mesesRestantes / Math.max(m.mesesTotais, 1)); // 1.0 no início do período, até 2.0 no fim

  const score = (0.30 * naoComprometido + 0.25 * naoExecutado + 0.25 * pctAEmitir + 0.20 * porte) * fatorUrgencia;
  return Math.min(score, 1);
}

function classificarRisco(
  p: ProjetoBase,
  m: {
    orcamentoPeriodo: number | null;
    pctExecucao: number | null;
    pctComprometimento: number | null;
    faltaComprometer: number | null;
    valorComprometidoTotal: number | null;
    desvioPlurianual: number | null;
  }
): { status: StatusRisco; acao: string } {
  // Dados insuficientes: sem orçamento do período E sem orçamento plurianual, nada a avaliar
  if (m.orcamentoPeriodo === null && p.orcamentoPlurianual === null) {
    return { status: "Dados insuficientes", acao: "Verificar cadastro do projeto (sem orçamento em nenhuma fonte)." };
  }

  // 🔴 Estouro: Executado + Compromisso > orçamento plurianual
  if (m.desvioPlurianual !== null && m.desvioPlurianual > 0) {
    return {
      status: "Estouro",
      acao: p.orcamentoPlurianual === 0
        ? "Regularizar contratação sem cobertura orçamentária (orçamento aprovado = zero)."
        : "Revisar orçamento plurianual — compromisso já contratado excede o teto aprovado.",
    };
  }

  // 🟠 Baixo comprometimento: Compromisso < 80% do orçamento do período E falta comprometer > R$50 mil
  const ehPreProducao = normalizePlataforma(p.n4) === "pre-producao";
  if (
    !ehPreProducao &&
    m.pctComprometimento !== null &&
    m.pctComprometimento < 0.8 &&
    m.faltaComprometer !== null &&
    m.faltaComprometer > 50000
  ) {
    return { status: "Baixo comprometimento", acao: "Acelerar emissão de contrato/PO para reduzir o saldo sem cobertura." };
  }

  // 🟡 Baixa execução: Execução < 40% do orçamento do período
  if (m.pctExecucao !== null && m.pctExecucao < 0.4) {
    return { status: "Baixa execução", acao: "Validar previsão de pagamento e reprogramar caixa se necessário." };
  }

  if (m.pctExecucao === null && m.pctComprometimento === null) {
    return { status: "Dados insuficientes", acao: "Métricas de execução/comprometimento não calculáveis para este período." };
  }

  return { status: "OK", acao: "Monitorar sem ação imediata." };
}

function normalizePlataforma(n4: string): string {
  return n4
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .includes("pre-prod")
    ? "pre-producao"
    : n4;
}

/** Preenche "participação no risco" no nível da carteira filtrada, usando o novo score proporcional. */
export function withParticipacaoRisco(lista: ProjetoMetricas[]): ProjetoMetricas[] {
  const riscoTotal = lista.reduce((acc, p) => acc + p.riscoScore, 0);
  return lista.map((p) => ({
    ...p,
    participacaoRisco: riscoTotal > 0 ? p.riscoScore / riscoTotal : null,
  }));
}
