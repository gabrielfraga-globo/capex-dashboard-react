import type { ProjetoMetricas } from "../types";
import { fmtBRL, fmtPct } from "./format";

// ============================================================================
// Funções puras e reaproveitáveis (dashboard hoje, e-mail/Copilot amanhã).
// Textos limitados a frases objetivas — sem parágrafos, sem justificativas.
// ============================================================================

export interface RiskSummary {
  estouro: { n: number; valor: number };
  riscoNaoRealizacao: { n: number; valor: number };
  revisaoFluxoCaixa: { n: number; valor: number };
  normal: { n: number };
  coberturaFinanceira: number | null;
  exposicaoFinanceira: number;
  nCriticos: number; // Estouro + Risco de Não Realização
}

export function generateRiskSummary(lista: ProjetoMetricas[]): RiskSummary {
  const estourados = lista.filter((p) => p.status === "Estouro");
  const riscoNaoReal = lista.filter((p) => p.status === "Risco de Não Realização");
  const revisaoFluxo = lista.filter((p) => p.status === "Revisar Caixa Ano");
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
    revisaoFluxoCaixa: { n: revisaoFluxo.length, valor: revisaoFluxo.reduce((a, p) => a + (p.aEmitir ?? 0), 0) },
    normal: { n: normal.length },
    coberturaFinanceira,
    exposicaoFinanceira,
    nCriticos: estourados.length + riscoNaoReal.length,
  };
}

export interface DeltaYTDSummary {
  planejadoAcumulado: number | null;
  executadoAcumulado: number | null;
  deltaYTD: number | null;
  headline: string; // ≤ 4 palavras de título, frase objetiva
  statusSimples: "Dentro do plano" | "Acompanhar" | "Requer ação";
}

function sumNullable(lista: ProjetoMetricas[], getter: (p: ProjetoMetricas) => number | null | undefined): number | null {
  let hasValue = false;
  const total = lista.reduce((acc, p) => {
    const value = getter(p);
    if (value === null || value === undefined || Number.isNaN(value)) return acc;
    hasValue = true;
    return acc + value;
  }, 0);
  return hasValue ? total : null;
}

/** Delta YTD agregado da carteira filtrada — o indicador executivo principal do Radar. */
/** Delta YTD agregado — o indicador executivo principal. Executado − Planejado:
 * negativo = atrás do plano, positivo = à frente do plano. */
export function generateDeltaYTD(lista: ProjetoMetricas[]): DeltaYTDSummary {
  const planejadoAcumulado = sumNullable(lista, (p) => p.planejadoAcumulado);
  const executadoAcumulado = sumNullable(lista, (p) => p.executadoAcumulado);
  const deltaYTD = planejadoAcumulado !== null && executadoAcumulado !== null ? executadoAcumulado - planejadoAcumulado : null;

  const pctDelta = planejadoAcumulado !== null && planejadoAcumulado > 0 && deltaYTD !== null ? deltaYTD / planejadoAcumulado : null;
  let headline: string;
  let statusSimples: "Dentro do plano" | "Acompanhar" | "Requer ação";
  if (pctDelta === null) {
    headline = "N/D no acumulado.";
    statusSimples = "Acompanhar";
  } else if (pctDelta < -0.15) { headline = "Requer ação — bem atrás do plano."; statusSimples = "Requer ação"; }
  else if (pctDelta < -0.05) { headline = "Acompanhar — levemente atrás do plano."; statusSimples = "Acompanhar"; }
  else if (pctDelta > 0.05) { headline = "À frente do plano."; statusSimples = "Dentro do plano"; }
  else { headline = "Dentro do plano."; statusSimples = "Dentro do plano"; }

  return { planejadoAcumulado, executadoAcumulado, deltaYTD, headline, statusSimples };
}

export interface ExecutiveSummaryData {
  headline: string;
  orcamentoPeriodo: number | null;
  executado: number | null;
  compromisso: number | null;
  aEmitir: number | null;
  coberturaFinanceira: number | null;
}

/** Frase de saúde geral — no máximo 8 palavras, é o único sinal de risco na primeira tela. */
export function generateExecutiveSummary(lista: ProjetoMetricas[]): ExecutiveSummaryData {
  const orcamentoPeriodo = sumNullable(lista, (p) => p.orcamentoPeriodo);
  const executado = sumNullable(lista, (p) => p.executado);
  const compromisso = sumNullable(lista, (p) => p.compromisso);
  const aEmitir = sumNullable(lista, (p) => p.aEmitir);

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
  if (risco.revisaoFluxoCaixa.n > 0) {
    out.push(`🔵 ${risco.revisaoFluxoCaixa.n} projetos precisam revisão de fluxo de caixa.`);
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

/** Insights específicos do Radar — narram o Delta YTD, não repetem cobertura/saldo a emitir. */
export function generateRadarInsights(lista: ProjetoMetricas[], delta: DeltaYTDSummary): string[] {
  const out: string[] = [];
  if (delta.deltaYTD === null) {
    out.push("Execução acumulada sem base suficiente para comparação.");
  } else {
    const sinal = delta.deltaYTD >= 0 ? "acima" : "abaixo";
    out.push(`Execução está ${fmtBRL(Math.abs(delta.deltaYTD), true)} ${sinal} do planejado acumulado.`);
  }

  // Contribuição por plataforma para o delta (não para o orçamento)
  const porPlataforma = new Map<string, number>();
  for (const p of lista) {
    const d = (p.executadoAcumulado ?? 0) - (p.planejadoAcumulado ?? 0);
    porPlataforma.set(p.n4Curta, (porPlataforma.get(p.n4Curta) ?? 0) + d);
  }
  const totalAbs = [...porPlataforma.values()].reduce((a, v) => a + Math.abs(v), 0);
  const top = [...porPlataforma.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  if (top && totalAbs > 0) {
    const pct = Math.round((Math.abs(top[1]) / totalAbs) * 100);
    out.push(`${top[0]} explica ${pct}% do resultado.`);
  }

  const ofensores = generateTopOffenders(lista, 6).filter((p) => p.status === "Estouro" || p.status === "Risco de Não Realização");
  if (ofensores.length > 0) {
    out.push(`${ofensores.length} projetos concentram o principal risco do ciclo.`);
  }

  const revisao = lista.filter((p) => p.status === "Revisar Caixa Ano");
  if (revisao.length > 0) {
    out.push(`${revisao.length} projetos exigem revisão de caixa.`);
  }

  return out.slice(0, 4);
}

/**
 * Frase única de síntese executiva do card "Execução do Plano" — substitui a tarja de
 * status simples E o antigo card de insights. No máximo 1 frase, ~2 linhas.
 */
export function generateHeroNarrative(lista: ProjetoMetricas[], delta: DeltaYTDSummary): string {
  const pctDelta =
    delta.planejadoAcumulado !== null &&
    delta.planejadoAcumulado > 0 &&
    delta.deltaYTD !== null
      ? delta.deltaYTD / delta.planejadoAcumulado
      : null;
  let base: string;
  if (pctDelta === null) base = "Sem base suficiente para comparar execução acumulada";
  else if (pctDelta > 0.05) base = "Carteira executa acima do plano acumulado";
  else if (pctDelta < -0.05) base = "Carteira executa abaixo do plano acumulado";
  else base = "Execução segue aderente ao plano acumulado";

  const risco = generateRiskSummary(lista);
  let clausula = "";

  if (risco.estouro.n > 0) {
    clausula = `, mas ${risco.estouro.n} projeto(s) já estão em estouro`;
  } else {
    const totalAEmitir = lista.reduce((a, p) => a + Math.max(p.aEmitir ?? 0, 0), 0);
    if (totalAEmitir > 0) {
      const plataformas = generatePlatformHighlights(lista);
      const top = [...plataformas].sort((a, b) => b.aEmitir - a.aEmitir)[0];
      if (top && totalAEmitir > 0 && top.aEmitir / totalAEmitir > 0.4) {
        clausula = `, mas ${top.plataforma} concentra o maior volume ainda sem cobertura financeira`;
      } else {
        clausula = `, mas possui ${fmtBRL(totalAEmitir, true)} ainda não emitidos`;
      }
    } else if (risco.revisaoFluxoCaixa.n > 0) {
      clausula = `, mas ${risco.revisaoFluxoCaixa.n} projeto(s) exigem revisão de caixa`;
    }
  }

  return `${base}${clausula}.`;
}
