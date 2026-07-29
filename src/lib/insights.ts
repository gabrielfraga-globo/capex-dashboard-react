import type { ProjetoMetricas } from "../types";
import { fmtBRL } from "./format";

// ============================================================================
// Funções puras e reaproveitáveis: alimentam o dashboard hoje e, no futuro,
// o e-mail executivo mensal e o agente Copilot — mesma lógica, mesmos números,
// em todos os consumidores.
// ============================================================================

export interface RiskSummary {
  estouro: { n: number; valor: number };
  baixoComprometimento: { n: number; valor: number };
  baixaExecucao: { n: number; valor: number };
  riscoFinanceiroTotal: number; // desvio plurianual + falta comprometer, somados (R$)
  totalAEmitir: number;
}

export function generateRiskSummary(lista: ProjetoMetricas[]): RiskSummary {
  const estourados = lista.filter((p) => p.status === "Estouro");
  const baixoComprom = lista.filter((p) => p.status === "Baixo comprometimento");
  const baixaExec = lista.filter((p) => p.status === "Baixa execução");

  const riscoFinanceiroTotal = lista.reduce(
    (acc, p) => acc + Math.max(p.desvioPlurianual ?? 0, 0) + Math.max(p.faltaComprometer ?? 0, 0),
    0
  );
  const totalAEmitir = lista.reduce((a, p) => a + Math.max(p.aEmitir ?? 0, 0), 0);

  return {
    estouro: { n: estourados.length, valor: estourados.reduce((a, p) => a + Math.max(p.desvioPlurianual ?? 0, 0), 0) },
    baixoComprometimento: { n: baixoComprom.length, valor: baixoComprom.reduce((a, p) => a + (p.faltaComprometer ?? 0), 0) },
    baixaExecucao: { n: baixaExec.length, valor: baixaExec.reduce((a, p) => a + (p.orcamentoPeriodo ?? 0), 0) },
    riscoFinanceiroTotal,
    totalAEmitir,
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

/** Ranking de ofensores por SCORE PROPORCIONAL (não valor absoluto) — ver metrics.ts::calculateRiskScore. */
export function generateTopOffenders(lista: ProjetoMetricas[], n = 5): ProjetoMetricas[] {
  return [...lista]
    .filter((p) => p.riscoScore > 0)
    .sort((a, b) => b.riscoScore - a.riscoScore)
    .slice(0, n);
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
      projetos: projetos.sort((a, b) => b.riscoScore - a.riscoScore),
      total: projetos.length,
    }))
    .sort((a, b) => b.total - a.total);
}

export interface PlatformHighlight {
  plataforma: string;
  orcamento: number;
  executado: number;
  compromisso: number;
  aEmitir: number;
  pctExecucao: number | null;
  pctComprometimento: number | null;
  nRisco: number; // nº de projetos em risco (qualquer status ≠ OK/Dados insuficientes)
  riscoScoreMedio: number;
}

/** Destaques por plataforma — base tanto do cartão "Plataformas em Atenção" quanto de insights. */
export function generatePlatformHighlights(lista: ProjetoMetricas[]): PlatformHighlight[] {
  const map = new Map<string, ProjetoMetricas[]>();
  for (const p of lista) {
    const arr = map.get(p.n4Curta) ?? [];
    arr.push(p);
    map.set(p.n4Curta, arr);
  }
  return Array.from(map.entries())
    .map(([plataforma, projetos]) => {
      const orcamento = projetos.reduce((a, p) => a + (p.orcamentoPeriodo ?? 0), 0);
      const executado = projetos.reduce((a, p) => a + (p.executado ?? 0), 0);
      const compromisso = projetos.reduce((a, p) => a + (p.compromisso ?? 0), 0);
      const aEmitir = projetos.reduce((a, p) => a + Math.max(p.aEmitir ?? 0, 0), 0);
      const nRisco = projetos.filter((p) => p.status !== "OK" && p.status !== "Dados insuficientes").length;
      const riscoScoreMedio = projetos.length > 0 ? projetos.reduce((a, p) => a + p.riscoScore, 0) / projetos.length : 0;
      return {
        plataforma, orcamento, executado, compromisso, aEmitir,
        pctExecucao: orcamento > 0 ? executado / orcamento : null,
        pctComprometimento: orcamento > 0 ? compromisso / orcamento : null,
        nRisco, riscoScoreMedio,
      };
    })
    .sort((a, b) => b.orcamento - a.orcamento);
}

/** Insights executivos — no máximo 1 frase cada, 3 a 5 no total, com número + impacto direto. */
export function generateExecutiveInsights(lista: ProjetoMetricas[]): string[] {
  const out: string[] = [];
  const risco = generateRiskSummary(lista);
  const plataformas = generatePlatformHighlights(lista);

  if (risco.totalAEmitir > 0) {
    out.push(`💰 ${fmtBRL(risco.totalAEmitir, true)} aguardam contratação.`);
  }
  if (risco.estouro.n > 0) {
    out.push(`🔴 ${risco.estouro.n} projetos apresentam risco de estouro.`);
  }

  const topPlat = plataformas[0];
  const totalAEmitirPlats = plataformas.reduce((a, p) => a + p.aEmitir, 0);
  if (topPlat && totalAEmitirPlats > 0 && topPlat.aEmitir > 0) {
    const pct = ((topPlat.aEmitir / totalAEmitirPlats) * 100).toFixed(0);
    out.push(`📊 ${topPlat.plataforma} concentra ${pct}% do saldo a emitir.`);
  }

  const ofensores = generateTopOffenders(lista, 5);
  if (ofensores.length >= 5 && risco.riscoFinanceiroTotal > 0) {
    const top5Risco = ofensores.reduce((a, p) => a + Math.max(p.desvioPlurianual ?? 0, 0) + Math.max(p.faltaComprometer ?? 0, 0), 0);
    const pct = ((top5Risco / risco.riscoFinanceiroTotal) * 100).toFixed(0);
    out.push(`🎯 Os cinco maiores ofensores representam ${pct}% da exposição financeira.`);
  }

  if (risco.baixoComprometimento.n > 0) {
    out.push(`🟠 ${risco.baixoComprometimento.n} projetos possuem baixo comprometimento (${fmtBRL(risco.baixoComprometimento.valor, true)}).`);
  }
  if (risco.baixaExecucao.n > 0) {
    out.push(`🟡 ${risco.baixaExecucao.n} projetos com execução abaixo de 40%.`);
  }

  return out.slice(0, 5);
}
