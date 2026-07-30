import type { ProjetoMetricas } from "../types";
import { fmtBRL, fmtPct } from "./format";

// ============================================================================
// Funções puras e reaproveitáveis (dashboard hoje, e-mail/Copilot amanhã).
// Textos limitados a frases objetivas — sem parágrafos, sem justificativas.
// ============================================================================

export interface RiskSummary {
  estouro: { n: number; valor: number };
  riscoNaoRealizacao: { n: number; valor: number };
  normal: { n: number };
  coberturaFinanceira: number | null;
  exposicaoFinanceira: number;
  nCriticos: number; // Estouro + Risco de Não Realização
}

export function generateRiskSummary(lista: ProjetoMetricas[]): RiskSummary {
  const estourados = lista.filter((p) => p.status === "Estouro");
  const riscoNaoReal = lista.filter((p) => p.status === "Risco de Não Realização");
  const normal = lista.filter((p) => p.status === "Normal");

  const somaOrcamento = lista.reduce((a, p) => a + (p.orcamentoPeriodo ?? 0), 0);
  const somaCoberto = lista.reduce((a, p) => a + (p.executado ?? 0) + (p.compromisso ?? 0), 0);
  const coberturaFinanceira = somaOrcamento > 0 ? somaCoberto / somaOrcamento : null;

  const exposicaoFinanceira = lista.reduce(
    (acc, p) => acc + (p.status === "Estouro" ? Math.max(p.desvioPlurianual ?? 0, 0) : p.status === "Risco de Não Realização" ? Math.max(p.aEmitir ?? 0, 0) : 0),
    0
  );

  return {
    estouro: { n: estourados.length, valor: estourados.reduce((a, p) => a + Math.max(p.desvioPlurianual ?? 0, 0), 0) },
    riscoNaoRealizacao: { n: riscoNaoReal.length, valor: riscoNaoReal.reduce((a, p) => a + Math.max(p.aEmitir ?? 0, 0), 0) },
    normal: { n: normal.length },
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

/** Frase de saúde geral — no máximo 8 palavras, é o único sinal de risco na primeira tela. */
export function generateExecutiveSummary(lista: ProjetoMetricas[]): ExecutiveSummaryData {
  const sum = (fn: (p: ProjetoMetricas) => number | null) => lista.reduce((a, p) => a + (fn(p) ?? 0), 0);
  const orcamentoPeriodo = sum((p) => p.orcamentoPeriodo);
  const executado = sum((p) => p.executado);
  const compromisso = sum((p) => p.compromisso);
  const aEmitir = sum((p) => p.aEmitir);

  const risco = generateRiskSummary(lista);
  let headline: string;
  if (risco.estouro.n > 0) {
    headline = `🔴 ${risco.estouro.n} projetos em estouro.`;
  } else if (risco.riscoNaoRealizacao.n > 0) {
    headline = `🟠 ${risco.riscoNaoRealizacao.n} projetos em risco de não realização.`;
  } else {
    headline = `🟢 Carteira saudável.`;
  }

  return { headline, orcamentoPeriodo, executado, compromisso, aEmitir, coberturaFinanceira: risco.coberturaFinanceira };
}

/** Ranking de ofensores por SCORE PROPORCIONAL. */
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
    if (p.status === "Normal" || p.status === "Dados insuficientes") continue;
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
  nRisco: number;
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
      const nRisco = projetos.filter((p) => p.status === "Estouro" || p.status === "Risco de Não Realização").length;
      const riscoScoreMedio = projetos.length > 0 ? projetos.reduce((a, p) => a + p.riscoScore, 0) / projetos.length : 0;
      return {
        plataforma, orcamento, executado, compromisso, aEmitir,
        coberturaFinanceira: orcamento > 0 ? (executado + compromisso) / orcamento : null,
        nRisco, riscoScoreMedio,
      };
    })
    .sort((a, b) => b.orcamento - a.orcamento);
}

/** Insights executivos — no máximo 8 palavras cada, 3 a 5 no total. */
export function generateExecutiveInsights(lista: ProjetoMetricas[]): string[] {
  const out: string[] = [];
  const risco = generateRiskSummary(lista);
  const plataformas = generatePlatformHighlights(lista);
  const totalAEmitir = lista.reduce((a, p) => a + Math.max(p.aEmitir ?? 0, 0), 0);

  if (totalAEmitir > 0) {
    out.push(`💰 ${fmtBRL(totalAEmitir, true)} fora do fluxo financeiro.`);
  }
  if (risco.coberturaFinanceira !== null) {
    out.push(`📈 Cobertura financeira em ${fmtPct(risco.coberturaFinanceira, 0)}.`);
  }

  const topPlat = plataformas[0];
  if (topPlat && totalAEmitir > 0 && topPlat.aEmitir > 0) {
    const pct = ((topPlat.aEmitir / totalAEmitir) * 100).toFixed(0);
    out.push(`📊 ${topPlat.plataforma} concentra ${pct}% do saldo.`);
  }

  if (risco.riscoNaoRealizacao.n > 0) {
    out.push(`🟠 ${risco.riscoNaoRealizacao.n} projetos em risco de não realização.`);
  }

  const ofensores = generateTopOffenders(lista, 5);
  if (ofensores.length >= 5 && risco.exposicaoFinanceira > 0) {
    const top5 = ofensores.reduce(
      (a, p) => a + (p.status === "Estouro" ? Math.max(p.desvioPlurianual ?? 0, 0) : Math.max(p.aEmitir ?? 0, 0)), 0
    );
    const pct = ((top5 / risco.exposicaoFinanceira) * 100).toFixed(0);
    out.push(`🎯 5 projetos concentram ${pct}% da exposição.`);
  }

  if (risco.estouro.n > 0) {
    out.push(`🔴 ${risco.estouro.n} projetos em estouro.`);
  }

  return out.slice(0, 5);
}
