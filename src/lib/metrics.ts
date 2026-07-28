import type { Periodo, ProjetoBase, ProjetoMetricas, StatusRisco } from "../types";

const MESES_2026_TOTAL = 12;
const MESES_2027_TOTAL = 3; // a planilha só tem jan-mar/2027 orçado
const MES_ATUAL = new Date().getMonth() + 1; // 1-12, referência "hoje" para ritmo necessário

function safeDiv(num: number | null, den: number | null): number | null {
  if (num === null || den === null || den === 0) return null;
  return num / den;
}

/** Resolve orçamento/executado/etc. do período selecionado para um projeto. */
export function computeMetricas(p: ProjetoBase, periodo: Periodo): ProjetoMetricas {
  let orcamentoPeriodo: number | null;
  let realizado: number | null;
  let emPagamento: number | null;
  let mesesRestantes: number;

  if (periodo === "2026") {
    orcamentoPeriodo = p.orcamento2026;
    realizado = p.realizado2026;
    emPagamento = p.emPagamento2026;
    mesesRestantes = Math.max(MESES_2026_TOTAL - MES_ATUAL, 1);
  } else if (periodo === "2027") {
    orcamentoPeriodo = p.orcamento2027;
    realizado = p.realizado2027;
    emPagamento = p.emPagamento2027;
    mesesRestantes = MESES_2027_TOTAL;
  } else {
    // Todos os anos: consolida 2026+2027 (aditivo — Compromisso NÃO é somado aqui, é tratado à parte)
    orcamentoPeriodo =
      p.orcamento2026 !== null || p.orcamento2027 !== null ? (p.orcamento2026 ?? 0) + (p.orcamento2027 ?? 0) : null;
    realizado = p.realizado2026 !== null || p.realizado2027 !== null ? (p.realizado2026 ?? 0) + (p.realizado2027 ?? 0) : null;
    emPagamento =
      p.emPagamento2026 !== null || p.emPagamento2027 !== null ? (p.emPagamento2026 ?? 0) + (p.emPagamento2027 ?? 0) : null;
    mesesRestantes = Math.max(MESES_2026_TOTAL - MES_ATUAL, 1) + MESES_2027_TOTAL;
  }

  const executado = realizado !== null || emPagamento !== null ? (realizado ?? 0) + (emPagamento ?? 0) : null;
  const pctExecucao = safeDiv(executado, orcamentoPeriodo);
  const compromisso = p.compromisso; // valor único, plurianual, nunca fracionado
  const pctComprometimento = safeDiv(compromisso, orcamentoPeriodo);
  const aEmitir = orcamentoPeriodo !== null && compromisso !== null ? orcamentoPeriodo - compromisso : null;
  const faltaComprometer = aEmitir !== null ? Math.max(aEmitir, 0) : null;
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

  return {
    ...p,
    periodo,
    orcamentoPeriodo,
    executado,
    pctExecucao,
    pctComprometimento,
    faltaComprometer,
    aEmitir,
    valorComprometidoTotal,
    pctOrcamentoPlurianual,
    desvioPlurianual,
    participacaoRisco: null, // preenchido depois, no agregado da carteira
    status,
    acaoRecomendada: acao,
    ritmoNecessario,
  };
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
  // Regra adicional: excluir Pré-Produção desta classificação específica; e nunca classificar
  // "A emitir" negativo como baixo comprometimento.
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

/** Preenche "participação no risco" no nível da carteira filtrada (não pode ser calculado por projeto isoladamente). */
export function withParticipacaoRisco(lista: ProjetoMetricas[]): ProjetoMetricas[] {
  const riscoTotal = lista.reduce((acc, p) => acc + Math.max(p.desvioPlurianual ?? 0, p.faltaComprometer ?? 0, 0), 0);
  return lista.map((p) => ({
    ...p,
    participacaoRisco: riscoTotal > 0 ? Math.max(p.desvioPlurianual ?? 0, p.faltaComprometer ?? 0, 0) / riscoTotal : null,
  }));
}
