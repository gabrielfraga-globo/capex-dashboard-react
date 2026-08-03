import { useMemo } from "react";
import type { KPIEstrategicoCarteira, ProjetoBase, ProjetoMetricas, RelatorioParsing, StatusSemaforo } from "../types";
import { computeMetricas, withParticipacaoRisco } from "../lib/metrics";
import type { Periodo } from "../types";
import { formatCurrencyMillions } from "../lib/format";

interface PortfolioMetricsResult {
  todasMetricas: ProjetoMetricas[];
}

function sumNullable(list: ProjetoMetricas[], pick: (p: ProjetoMetricas) => number | null): number | null {
  let hasValue = false;
  const total = list.reduce((acc, item) => {
    const value = pick(item);
    if (value === null || Number.isNaN(value)) return acc;
    hasValue = true;
    return acc + value;
  }, 0);
  return hasValue ? total : null;
}

function safeDiv(num: number | null, den: number | null): number | null {
  if (num === null || den === null || den === 0) return null;
  return num / den;
}

function statusByBands(value: number | null, greenMin: number, greenMax: number, yellowMin: number, yellowMax: number): StatusSemaforo {
  if (value === null || Number.isNaN(value)) return "nd";
  if (value >= greenMin && value <= greenMax) return "verde";
  if (value >= yellowMin && value <= yellowMax) return "amarelo";
  return "vermelho";
}

function directionByCenter(value: number | null, center: number): "up" | "down" | "none" {
  if (value === null || Number.isNaN(value)) return "none";
  return value >= center ? "up" : "down";
}

const KPI_NOME: Record<"velocidadeCaixa" | "empenho" | "equilibrioFinanceiro", string> = {
  velocidadeCaixa: "Gestão do caixa",
  empenho: "Gestão do empenho",
  equilibrioFinanceiro: "Consumo do Orçamento",
};

const STATUS_LABEL: Record<
  "velocidadeCaixa" | "empenho" | "equilibrioFinanceiro",
  { verde: string; baixo: string; alto: string }
> = {
  velocidadeCaixa:      { verde: "Dentro da Meta", baixo: "Atrasado",       alto: "Acelerado"    },
  empenho:              { verde: "Dentro da Meta", baixo: "Abaixo do Ideal", alto: "Estourado"   },
  equilibrioFinanceiro: { verde: "Dentro da Meta", baixo: "Abaixo do Ideal", alto: "Estourado"   },
};

function resolveStatusLabel(
  id: "velocidadeCaixa" | "empenho" | "equilibrioFinanceiro",
  value: number | null,
  status: StatusSemaforo
): string | null {
  if (status === "nd") return "Dados insuficientes";
  if (value === null) return "Dados insuficientes";
  const map = STATUS_LABEL[id];
  if (status === "verde") return map.verde;
  return value < 1 ? map.baixo : map.alto;
}

function generateDescricaoExecutiva(
  id: "velocidadeCaixa" | "empenho" | "equilibrioFinanceiro",
  value: number | null,
  status: StatusSemaforo
): string {
  if (status === "nd" || value === null) {
    const msgs: Record<typeof id, string> = {
      velocidadeCaixa: "Não foi possível avaliar o ritmo de execução para o período.",
      empenho: "Não foi possível calcular a capacidade de execução para o período.",
      equilibrioFinanceiro: "Não foi possível avaliar o consumo do orçamento para o período.",
    };
    return msgs[id];
  }

  if (id === "velocidadeCaixa") {
    if (status === "verde") return "Ritmo de execução compatível com o plano.";
    if (status === "amarelo") return value < 1
      ? "Ritmo de execução ligeiramente abaixo do orçamento — Acompanhamento recomendado."
      : "Ritmo de execução acelerado em relação ao orçamento.";
    return value < 1
      ? "Ritmo de execução significativamente atrasado — Ação imediata necessária."
      : "Execução em patamar crítico acima do orçamento — Revisão urgente.";
  }

  if (id === "empenho") {
    if (status === "verde") return "Ritmo de emissões compatível com compromisso de caixa ano.";
    if (status === "amarelo") return value < 1
      ? "Ritmo de emissões insuficiente para compromisso de caixa ano."
      : "Volume emitido acelerado — Monitorar sustentabilidade.";
    return value < 1
      ? "Ritmo de emissões insuficiente para compromisso de caixa ano — Investigar bloqueios urgente."
      : "Volume emitido crítico acima da previsão — Avaliar urgente.";
  }

  // equilibrioFinanceiro
  if (status === "verde") return "Orçamento comprometido dentro dos limites definidos.";
  if (status === "amarelo") return value < 1
    ? "Orçamento com comprometimento abaixo do esperado para o período."
    : "Orçamento comprometido acima do limite — Revisar posições.";
  return value < 1
    ? "Comprometimento crítico abaixo do necessário — Ação necessária."
    : "Comprometimento crítico acima do orçamento — Ação urgente.";
}

function buildTooltipDetalhado(
  id: "velocidadeCaixa" | "empenho" | "equilibrioFinanceiro",
  _valor: number | null,
  _status: StatusSemaforo,
  _meta: string,
  num: number | null,
  den: number | null
): string {
  const fmtM = (v: number | null) => formatCurrencyMillions(v);
  if (id === "velocidadeCaixa") {
    return `Fórmula: Caixa Realizado (${fmtM(num)}) / Caixa Planejado (${fmtM(den)})`;
  }
  if (id === "empenho") {
    return `Fórmula: Total Emitido (${fmtM(num)}) / Caixa a Realizar (${fmtM(den)})`;
  }
  return `Fórmula: Comprometido (${fmtM(num)}) / Orçamento (${fmtM(den)})`;
}

function normalizeProjetoBase(p: ProjetoBase): ProjetoBase {
  return {
    ...p,
    orcamentoPlurianual: p.orcamentoPlurianual ?? null,
    orcamento2026: p.orcamento2026 ?? null,
    orcamento2027: p.orcamento2027 ?? null,
    h1_2026: p.h1_2026 ?? null,
    h2_2026: p.h2_2026 ?? null,
    meses2026: p.meses2026 ?? null,
    meses2027: p.meses2027 ?? null,
    executadoMensal2026: p.executadoMensal2026 ?? null,
    realizado2026: p.realizado2026 ?? null,
    emPagamento2026: p.emPagamento2026 ?? null,
    realizado2027: p.realizado2027 ?? null,
    emPagamento2027: p.emPagamento2027 ?? null,
    compromisso: p.compromisso ?? null,
  };
}

function buildKpisEstrategicos(list: ProjetoMetricas[]): { kpis: KPIEstrategicoCarteira[]; pctExecucaoPlano: number | null; aEmitirAno: number | null } {
  const ndKpis: KPIEstrategicoCarteira[] = ([
    "velocidadeCaixa",
    "empenho",
  ] as const).map((id) => ({
    id,
    nome: KPI_NOME[id],
    valor: null,
    status: "nd" as const,
    statusLabel: "Dados insuficientes",
    descricaoExecutiva: generateDescricaoExecutiva(id, null, "nd"),
    direcao: "none" as const,
    meta: id === "velocidadeCaixa" ? "0,90 a 1,10" : "0,95 a 1,05",
    formula: id === "velocidadeCaixa"
      ? "Realizado Acumulado / Planejado Acumulado"
      : id === "empenho"
      ? "(Emitido + Em Pagamento) / (Orçamento Anual − Realizado Acumulado)"
      : "(Executado + Emitido) / Orçamento Anual",
    tooltipDetalhado: buildTooltipDetalhado(id, null, "nd",
      id === "velocidadeCaixa" ? "0,90 a 1,10" : "0,95 a 1,05", null, null),
  }));

  if (list.length === 0) return { kpis: ndKpis, pctExecucaoPlano: null, aEmitirAno: null };

  const totalRealizadoAcumulado = sumNullable(list, (p) => p.realizadoAcumulado);
  const totalPlanejado = sumNullable(list, (p) => p.planejadoAcumulado);
  const totalCompromisso = sumNullable(list, (p) => p.compromisso);
  const totalExecutado = sumNullable(list, (p) => p.executado);
  const totalOrcamento = sumNullable(list, (p) => p.orcamentoPeriodo);
  const totalProvisionado =
    totalExecutado !== null || totalCompromisso !== null
      ? (totalExecutado ?? 0) + (totalCompromisso ?? 0)
      : null;

  // Ritmo de Execução: Realizado Acumulado / Planejado Acumulado
  const ritmoExecucao = safeDiv(totalRealizadoAcumulado, totalPlanejado);

  // Capacidade de Execução: (Emitido + Em Pagamento) / (Orçamento Anual - Realizado Acumulado)
  // Emitido = compromisso; Em Pagamento = executado - realizadoAcumulado
  const totalEmPagamento =
    totalExecutado !== null && totalRealizadoAcumulado !== null
      ? totalExecutado - totalRealizadoAcumulado
      : null;
  const numCapExec =
    totalCompromisso !== null || totalEmPagamento !== null
      ? (totalCompromisso ?? 0) + (totalEmPagamento ?? 0)
      : null;
  const denCapExec =
    totalOrcamento !== null && totalRealizadoAcumulado !== null
      ? totalOrcamento - totalRealizadoAcumulado
      : null;
  // Só retorna null se o divisor for zero ou negativo
  const capacidadeExecucao =
    denCapExec !== null && denCapExec > 0 ? safeDiv(numCapExec, denCapExec) : null;

  const velStatus = statusByBands(ritmoExecucao, 0.9, 1.1, 0.85, 1.15);
  const empStatus = statusByBands(capacidadeExecucao, 0.95, 1.05, 0.9, 1.1);

  const velLabel = resolveStatusLabel("velocidadeCaixa", ritmoExecucao, velStatus);
  const empLabel = resolveStatusLabel("empenho", capacidadeExecucao, empStatus);

  const pctExecucaoPlano = safeDiv(totalProvisionado, totalOrcamento);

  // A emitir ano = Orçamento - (Realizado + Em Pagamento) - Total Emitido
  const aEmitirAno =
    totalOrcamento !== null && totalExecutado !== null && totalCompromisso !== null
      ? totalOrcamento - totalExecutado - totalCompromisso
      : null;

  return {
    kpis: [
    {
      id: "velocidadeCaixa" as const,
      nome: KPI_NOME.velocidadeCaixa,
      valor: ritmoExecucao,
      status: velStatus,
      statusLabel: velLabel,
      descricaoExecutiva: generateDescricaoExecutiva("velocidadeCaixa", ritmoExecucao, velStatus),
      direcao: directionByCenter(ritmoExecucao, 1),
      meta: "0,90 a 1,10",
      formula: "Realizado Acumulado / Planejado Acumulado",
      tooltipDetalhado: buildTooltipDetalhado(
        "velocidadeCaixa", ritmoExecucao, velStatus, "0,90 a 1,10",
        totalRealizadoAcumulado, totalPlanejado
      ),
    },
    {
      id: "empenho" as const,
      nome: KPI_NOME.empenho,
      valor: capacidadeExecucao,
      status: empStatus,
      statusLabel: empLabel,
      descricaoExecutiva: generateDescricaoExecutiva("empenho", capacidadeExecucao, empStatus),
      direcao: directionByCenter(capacidadeExecucao, 1),
      meta: "0,95 a 1,05",
      formula: "(Emitido + Em Pagamento) / (Orçamento Anual − Realizado Acumulado)",
      tooltipDetalhado: buildTooltipDetalhado(
        "empenho", capacidadeExecucao, empStatus, "0,95 a 1,05",
        numCapExec, denCapExec
      ),
    },
  ],
    pctExecucaoPlano,
    aEmitirAno,
  };
}

export function useKpisEstrategicos(list: ProjetoMetricas[]): KPIEstrategicoCarteira[] {
  return useMemo(() => buildKpisEstrategicos(list).kpis, [list]);
}

export function usePctExecucaoPlano(list: ProjetoMetricas[]): number | null {
  return useMemo(() => buildKpisEstrategicos(list).pctExecucaoPlano, [list]);
}

export function useAEmitirAno(list: ProjetoMetricas[]): number | null {
  return useMemo(() => buildKpisEstrategicos(list).aEmitirAno, [list]);
}

export function usePortfolioMetrics(
  parsed: RelatorioParsing | null,
  periodo: Periodo
): PortfolioMetricsResult {
  const todasMetricas = useMemo(() => {
    if (!parsed) return [];
    return withParticipacaoRisco(parsed.projetos.map((p) => computeMetricas(normalizeProjetoBase(p), periodo)));
  }, [parsed, periodo]);

  return { todasMetricas };
}
