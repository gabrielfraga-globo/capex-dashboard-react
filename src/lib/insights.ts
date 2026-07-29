import type { ProjetoMetricas } from "../types";
import { fmtBRL } from "./format";

// ============================================================================
// Funções puras e reaproveitáveis: alimentam o dashboard hoje e, no futuro,
// o e-mail executivo mensal e o agente Copilot — sem duplicar lógica.
// ============================================================================

export interface RiskSummary {
  estouro: { n: number; valor: number };
  baixoComprometimento: { n: number; valor: number };
  baixaExecucao: { n: number; valor: number };
  riscoFinanceiroTotal: number; // desvio plurianual + falta comprometer, somados
}

export function generateRiskSummary(lista: ProjetoMetricas[]): RiskSummary {
  const estourados = lista.filter((p) => p.status === "Estouro");
  const baixoComprom = lista.filter((p) => p.status === "Baixo comprometimento");
  const baixaExec = lista.filter((p) => p.status === "Baixa execução");

  const riscoFinanceiroTotal = lista.reduce(
    (acc, p) => acc + Math.max(p.desvioPlurianual ?? 0, 0) + Math.max(p.faltaComprometer ?? 0, 0),
    0
  );

  return {
    estouro: { n: estourados.length, valor: estourados.reduce((a, p) => a + Math.max(p.desvioPlurianual ?? 0, 0), 0) },
    baixoComprometimento: { n: baixoComprom.length, valor: baixoComprom.reduce((a, p) => a + (p.faltaComprometer ?? 0), 0) },
    baixaExecucao: { n: baixaExec.length, valor: baixaExec.reduce((a, p) => a + (p.orcamentoPeriodo ?? 0), 0) },
    riscoFinanceiroTotal,
  };
}

export interface ExecutiveSummaryData {
  headline: string;
  orcamentoPeriodo: number;
  orcamentoPlurianual: number;
  executado: number;
  compromisso: number;
  aEmitir: number;
  pctExecucao: number | null;
}

export function generateExecutiveSummary(lista: ProjetoMetricas[]): ExecutiveSummaryData {
  const sum = (fn: (p: ProjetoMetricas) => number | null) => lista.reduce((a, p) => a + (fn(p) ?? 0), 0);
  const orcamentoPeriodo = sum((p) => p.orcamentoPeriodo);
  const orcamentoPlurianual = sum((p) => p.orcamentoPlurianual);
  const executado = sum((p) => p.executado);
  const compromisso = sum((p) => p.compromisso);
  const aEmitir = sum((p) => p.aEmitir);
  const pctExecucao = orcamentoPeriodo > 0 ? executado / orcamentoPeriodo : null;

  const risco = generateRiskSummary(lista);
  let headline: string;
  if (risco.estouro.n > 0) {
    headline = `🔴 A carteira tem ${risco.estouro.n} projeto(s) em estouro plurianual — prioridade máxima.`;
  } else if (pctExecucao !== null && pctExecucao < 0.4) {
    headline = `🟡 Execução em ${(pctExecucao * 100).toFixed(0)}% — risco para o caixa do período.`;
  } else if (risco.baixoComprometimento.n > 0) {
    headline = `🟠 ${risco.baixoComprometimento.n} projeto(s) com baixo comprometimento (${fmtBRL(risco.baixoComprometimento.valor, true)}).`;
  } else {
    headline = `🟢 Carteira sem riscos críticos nos filtros atuais.`;
  }

  return { headline, orcamentoPeriodo, orcamentoPlurianual, executado, compromisso, aEmitir, pctExecucao };
}

export function generateTopOffenders(lista: ProjetoMetricas[], n = 5): ProjetoMetricas[] {
  return [...lista]
    .map((p) => ({ p, score: Math.max(p.desvioPlurianual ?? 0, 0) * 2 + Math.max(p.faltaComprometer ?? 0, 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.p);
}

export interface AcaoAgrupada {
  acao: string;
  projetos: ProjetoMetricas[];
  total: number;
}

export function generateActionPlan(lista: ProjetoMetricas[]): AcaoAgrupada[] {
  const map = new Map<string, ProjetoMetricas[]>();
  for (const p of lista) {
    if (p.status === "OK" || p.status === "Dados insuficientes") continue;
    const arr = map.get(p.acaoRecomendada) ?? [];
    arr.push(p);
    map.set(p.acaoRecomendada, arr);
  }
  return Array.from(map.entries())
    .map(([acao, projetos]) => ({
      acao,
      projetos: projetos.sort((a, b) => (b.faltaComprometer ?? b.desvioPlurianual ?? 0) - (a.faltaComprometer ?? a.desvioPlurianual ?? 0)),
      total: projetos.length,
    }))
    .sort((a, b) => b.total - a.total);
}

/** Insights executivos — no máximo 1 frase cada, sempre com número + impacto direto. */
export function generateInsights(lista: ProjetoMetricas[]): string[] {
  const out: string[] = [];
  const risco = generateRiskSummary(lista);
  const totalAEmitir = lista.reduce((a, p) => a + Math.max(p.aEmitir ?? 0, 0), 0);

  if (risco.estouro.n > 0) {
    out.push(`🔴 ${fmtBRL(risco.estouro.valor, true)} em risco de estouro (${risco.estouro.n} projetos).`);
  }
  if (risco.baixoComprometimento.n > 0) {
    out.push(`🟠 ${risco.baixoComprometimento.n} projetos possuem baixo comprometimento (${fmtBRL(risco.baixoComprometimento.valor, true)}).`);
  }

  const porPlataforma = new Map<string, number>();
  for (const p of lista) porPlataforma.set(p.n4Curta, (porPlataforma.get(p.n4Curta) ?? 0) + Math.max(p.aEmitir ?? 0, 0));
  const top = [...porPlataforma.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && totalAEmitir > 0) {
    const pct = ((top[1] / totalAEmitir) * 100).toFixed(0);
    out.push(`📊 ${top[0]} concentra ${pct}% do saldo a emitir da carteira.`);
  }

  const ofensores = generateTopOffenders(lista, 5);
  if (ofensores.length >= 5) {
    const top5Risco = ofensores.reduce((a, p) => a + Math.max(p.desvioPlurianual ?? 0, 0) + Math.max(p.faltaComprometer ?? 0, 0), 0);
    const pct = risco.riscoFinanceiroTotal > 0 ? ((top5Risco / risco.riscoFinanceiroTotal) * 100).toFixed(0) : "0";
    out.push(`🎯 Os 5 maiores ofensores concentram ${pct}% da exposição financeira.`);
  }

  if (risco.baixaExecucao.n > 0) {
    out.push(`🟡 ${risco.baixaExecucao.n} projetos com execução abaixo de 40% — risco para o caixa corrente.`);
  }

  return out.slice(0, 3);
}
