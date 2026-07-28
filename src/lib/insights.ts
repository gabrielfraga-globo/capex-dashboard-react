import type { ProjetoMetricas } from "../types";
import { fmtBRL, fmtPct } from "./format";

export interface Insight {
  conclusao: string;
  valor: string;
  comparacao: string;
  impacto: string;
  acao: string;
}

export function gerarInsights(lista: ProjetoMetricas[]): Insight[] {
  const insights: Insight[] = [];
  if (lista.length === 0) return insights;

  const totalAEmitir = lista.reduce((a, p) => a + Math.max(p.aEmitir ?? 0, 0), 0);
  const totalOrcamento = lista.reduce((a, p) => a + (p.orcamentoPeriodo ?? 0), 0);

  // 1) Plataforma que concentra maior valor a emitir
  const porPlataforma = groupSum(lista, (p) => p.n4Curta, (p) => Math.max(p.aEmitir ?? 0, 0));
  const [topPlataforma, valorTopPlataforma] = maxEntry(porPlataforma);
  if (topPlataforma && totalAEmitir > 0) {
    const pct = valorTopPlataforma / totalAEmitir;
    const projetosDaPlataforma = lista
      .filter((p) => p.n4Curta === topPlataforma)
      .sort((a, b) => (b.aEmitir ?? 0) - (a.aEmitir ?? 0))
      .slice(0, 2)
      .map((p) => p.nome);
    insights.push({
      conclusao: `${topPlataforma} concentra ${fmtPct(pct)} do valor ainda a emitir da carteira filtrada.`,
      valor: fmtBRL(valorTopPlataforma),
      comparacao: `${fmtPct(pct)} do total de ${fmtBRL(totalAEmitir)} a emitir`,
      impacto: "Maior exposição a atraso de contratação e reajuste de preço na carteira.",
      acao: `Priorizar emissão de contrato em ${projetosDaPlataforma.join(" e ") || "projetos desta plataforma"}.`,
    });
  }

  // 2) Projetos em estouro
  const estourados = lista.filter((p) => p.status === "Estouro");
  if (estourados.length > 0) {
    const totalDesvio = estourados.reduce((a, p) => a + Math.max(p.desvioPlurianual ?? 0, 0), 0);
    const pior = [...estourados].sort((a, b) => (b.desvioPlurianual ?? 0) - (a.desvioPlurianual ?? 0))[0];
    insights.push({
      conclusao: `${estourados.length} projeto(s) já ultrapassaram o orçamento plurianual aprovado.`,
      valor: fmtBRL(totalDesvio),
      comparacao: `Maior caso: ${pior.nome} (${fmtBRL(pior.desvioPlurianual)} acima do teto)`,
      impacto: "Desvio já contratado/executado sem cobertura orçamentária — risco de reprovação em auditoria.",
      acao: "Revisar orçamento plurianual desses projetos junto à diretoria antes da próxima rodada de compras.",
    });
  }

  // 3) Baixo comprometimento — maior bolsão de valor parado
  const baixoComprom = lista.filter((p) => p.status === "Baixo comprometimento");
  if (baixoComprom.length > 0) {
    const somaFalta = baixoComprom.reduce((a, p) => a + (p.faltaComprometer ?? 0), 0);
    const top3 = [...baixoComprom].sort((a, b) => (b.faltaComprometer ?? 0) - (a.faltaComprometer ?? 0)).slice(0, 3);
    insights.push({
      conclusao: `${baixoComprom.length} projetos têm comprometimento abaixo de 80% do orçamento do período, com saldo relevante ainda sem contrato.`,
      valor: fmtBRL(somaFalta),
      comparacao: totalOrcamento > 0 ? `${fmtPct(somaFalta / totalOrcamento)} do orçamento do período filtrado` : "—",
      impacto: "Risco de não conseguir executar o orçamento dentro do prazo remanescente do período.",
      acao: `Acelerar contratação em ${top3.map((p) => p.nome).join(", ")}.`,
    });
  }

  // 4) Baixa execução — o que mais compromete o caixa do período corrente
  const baixaExec = lista.filter((p) => p.status === "Baixa execução");
  if (baixaExec.length > 0) {
    const somaOrc = baixaExec.reduce((a, p) => a + (p.orcamentoPeriodo ?? 0), 0);
    const pior = [...baixaExec].sort((a, b) => (a.pctExecucao ?? 1) - (b.pctExecucao ?? 1))[0];
    insights.push({
      conclusao: `${baixaExec.length} projetos executaram menos de 40% do orçamento do período — o risco mais crítico para o caixa corrente.`,
      valor: fmtBRL(somaOrc, true),
      comparacao: `Pior caso: ${pior.nome} (${fmtPct(pior.pctExecucao)} executado)`,
      impacto: "Risco de subutilização do orçamento aprovado e represamento de caixa no fim do período.",
      acao: "Validar previsão de pagamento com os gestores e reprogramar caixa das próximas semanas.",
    });
  }

  // 5) Concentração dos 5 maiores riscos
  const ranked = [...lista]
    .map((p) => ({ p, risco: Math.max(p.desvioPlurianual ?? 0, p.faltaComprometer ?? 0, 0) }))
    .filter((x) => x.risco > 0)
    .sort((a, b) => b.risco - a.risco);
  if (ranked.length >= 5) {
    const top5 = ranked.slice(0, 5).reduce((a, x) => a + x.risco, 0);
    const total = ranked.reduce((a, x) => a + x.risco, 0);
    const pct = total > 0 ? top5 / total : 0;
    insights.push({
      conclusao: `Os 5 maiores riscos financeiros da carteira filtrada concentram ${fmtPct(pct)} do risco total identificado.`,
      valor: fmtBRL(top5),
      comparacao: `de ${fmtBRL(total)} em risco total (estouro + falta de comprometimento)`,
      impacto: "Poucos projetos concentram a maior parte do risco — alavancagem alta para ação focada.",
      acao: `Priorizar plano de ação em: ${ranked.slice(0, 5).map((x) => x.p.nome).join(", ")}.`,
    });
  }

  return insights.slice(0, 5);
}

function groupSum<T>(lista: T[], keyFn: (t: T) => string, valFn: (t: T) => number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of lista) {
    const k = keyFn(item);
    out[k] = (out[k] ?? 0) + valFn(item);
  }
  return out;
}

function maxEntry(obj: Record<string, number>): [string | null, number] {
  let bestK: string | null = null;
  let bestV = -Infinity;
  for (const [k, v] of Object.entries(obj)) {
    if (v > bestV) { bestV = v; bestK = k; }
  }
  return [bestK, bestK ? bestV : 0];
}
