import type { ProjetoMetricas } from "../types";
import { fmtBRL, fmtPct } from "./format";

// ============================================================================
// Funções puras e reaproveitáveis (dashboard hoje, e-mail/Copilot amanhã).
// Ótica: Cobertura Financeira e Risco de Não Realização — não apenas Estouro.
// ============================================================================

export interface RiskSummary {
  estouro: { n: number; valor: number };
  riscoNaoRealizacao: { n: number; valor: number };
  atencao: { n: number; valor: number };
  revisaoFinanceira: { n: number; valor: number };
  coberturaFinanceira: number | null; // % agregado da carteira filtrada
  exposicaoFinanceira: number; // R$ — estouro (excedente) + saldo ainda sem cobertura
  nCriticos: number; // Estouro + Risco de Não Realização
}

export function generateRiskSummary(lista: ProjetoMetricas[]): RiskSummary {
  const estourados = lista.filter((p) => p.status === "Estouro");
  const riscoNaoReal = lista.filter((p) => p.status === "Risco de Não Realização");
  const atencao = lista.filter((p) => p.status === "Atenção");
  const revisao = lista.filter((p) => p.status === "Revisão Financeira");

  const somaOrcamento = lista.reduce((a, p) => a + (p.orcamentoPeriodo ?? 0), 0);
  const somaCoberto = lista.reduce((a, p) => a + (p.executado ?? 0) + (p.compromisso ?? 0), 0);
  const coberturaFinanceira = somaOrcamento > 0 ? somaCoberto / somaOrcamento : null;

  const exposicaoFinanceira = lista.reduce(
    (acc, p) => acc + (p.status === "Estouro" ? Math.max(p.desvioPlurianual ?? 0, 0) : Math.max(p.aEmitir ?? 0, 0)),
    0
  );

  return {
    estouro: { n: estourados.length, valor: estourados.reduce((a, p) => a + Math.max(p.desvioPlurianual ?? 0, 0), 0) },
    riscoNaoRealizacao: { n: riscoNaoReal.length, valor: riscoNaoReal.reduce((a, p) => a + Math.max(p.aEmitir ?? 0, 0), 0) },
    atencao: { n: atencao.length, valor: atencao.reduce((a, p) => a + Math.max(p.aEmitir ?? 0, 0), 0) },
    revisaoFinanceira: { n: revisao.length, valor: revisao.reduce((a, p) => a + (p.aEmitir ?? 0), 0) },
    coberturaFinanceira,
    exposicaoFinanceira,
    nCriticos: estourados.length + riscoNaoReal.length,
  };
}

export interface ExecutiveSummaryData {
  headline: string;
  orcamentoPeriodo: number;
  executado: number;
  compromisso: number;
  aEmitir: number;
  coberturaFinanceira: number | null;
}

export function generateExecutiveSummary(lista: ProjetoMetricas[]): ExecutiveSummaryData {
  const sum = (fn: (p: ProjetoMetricas) => number | null) => lista.reduce((a, p) => a + (fn(p) ?? 0), 0);
  const orcamentoPeriodo = sum((p) => p.orcamentoPeriodo);
  const executado = sum((p) => p.executado);
  const compromisso = sum((p) => p.compromisso);
  const aEmitir = sum((p) => p.aEmitir);

  const risco = generateRiskSummary(lista);
  let headline: string;
  if (risco.estouro.n > 0) {
    headline = `🔴 ${risco.estouro.n} projeto(s) em estouro plurianual — prioridade máxima.`;
  } else if (risco.coberturaFinanceira !== null && risco.coberturaFinanceira < 0.7) {
    headline = `🟠 Cobertura financeira em ${(risco.coberturaFinanceira * 100).toFixed(0)}% — risco de não realização do orçamento.`;
  } else if (risco.riscoNaoRealizacao.n > 0) {
    headline = `🟠 ${risco.riscoNaoRealizacao.n} projeto(s) com risco de não realização (${fmtBRL(risco.riscoNaoRealizacao.valor, true)}).`;
  } else {
    headline = `🟢 Carteira com boa cobertura financeira nos filtros atuais.`;
  }

  return { headline, orcamentoPeriodo, executado, compromisso, aEmitir, coberturaFinanceira: risco.coberturaFinanceira };
}

/** Ranking de ofensores por SCORE PROPORCIONAL — ver metrics.ts::calculateRiskScore. */
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
    if (p.status === "Coberto" || p.status === "Dados insuficientes") continue;
    const arr = map.get(p.acaoRecomendada) ?? [];
    arr.push(p);
    map.set(p.acaoRecomendada, arr);
  }
  return Array.from(map.entries())
    .map(([acao, projetos]) => ({ acao, projetos: projetos.sort((a, b) => b.riscoScore - a.riscoScore), total: projetos.length }))
    .sort((a, b) => b.total - a.total);
}

export interface PlatformHighlight {
  plataforma: string;
  orcamento: number;
  executado: number;
  compromisso: number;
  aEmitir: number;
  coberturaFinanceira: number | null;
  nRisco: number; // nº de projetos fora de "Coberto"/"Dados insuficientes"
  riscoScoreMedio: number;
}

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
      const nRisco = projetos.filter((p) => p.status !== "Coberto" && p.status !== "Dados insuficientes").length;
      const riscoScoreMedio = projetos.length > 0 ? projetos.reduce((a, p) => a + p.riscoScore, 0) / projetos.length : 0;
      return {
        plataforma, orcamento, executado, compromisso, aEmitir,
        coberturaFinanceira: orcamento > 0 ? (executado + compromisso) / orcamento : null,
        nRisco, riscoScoreMedio,
      };
    })
    .sort((a, b) => b.orcamento - a.orcamento);
}

/** Insights executivos — no máximo 1 frase cada, 3 a 5 no total. */
export function generateExecutiveInsights(lista: ProjetoMetricas[]): string[] {
  const out: string[] = [];
  const risco = generateRiskSummary(lista);
  const plataformas = generatePlatformHighlights(lista);
  const totalAEmitir = lista.reduce((a, p) => a + Math.max(p.aEmitir ?? 0, 0), 0);

  if (totalAEmitir > 0) {
    out.push(`💰 ${fmtBRL(totalAEmitir, true)} ainda não entraram no fluxo financeiro.`);
  }

  const topPlat = plataformas[0];
  if (topPlat && totalAEmitir > 0 && topPlat.aEmitir > 0) {
    const pct = ((topPlat.aEmitir / totalAEmitir) * 100).toFixed(0);
    out.push(`📊 ${pct}% do saldo a emitir está concentrado em ${topPlat.plataforma}.`);
  }

  if (risco.riscoNaoRealizacao.n > 0) {
    out.push(`🟠 ${risco.riscoNaoRealizacao.n} projetos possuem mais de 30% do orçamento sem cobertura financeira.`);
  }

  const ofensores = generateTopOffenders(lista, 5);
  if (ofensores.length >= 5 && risco.exposicaoFinanceira > 0) {
    const top5 = ofensores.reduce(
      (a, p) => a + (p.status === "Estouro" ? Math.max(p.desvioPlurianual ?? 0, 0) : Math.max(p.aEmitir ?? 0, 0)), 0
    );
    const pct = ((top5 / risco.exposicaoFinanceira) * 100).toFixed(0);
    out.push(`🎯 ${ofensores.length} projetos representam ${pct}% da exposição da carteira.`);
  }

  if (risco.coberturaFinanceira !== null) {
    out.push(`📈 A cobertura financeira da carteira está em ${fmtPct(risco.coberturaFinanceira, 0)}.`);
  }

  if (risco.estouro.n > 0) {
    out.push(`🔴 ${risco.estouro.n} projetos apresentam risco de estouro.`);
  }

  return out.slice(0, 5);
}
