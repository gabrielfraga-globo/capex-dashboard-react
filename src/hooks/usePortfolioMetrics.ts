import { useMemo } from "react";
import type { KPIEstrategicoCarteira, ProjetoBase, ProjetoMetricas, RelatorioParsing } from "../types";
import { computeMetricas, withParticipacaoRisco } from "../lib/metrics";
import type { Periodo } from "../types";

interface PortfolioMetricsResult {
  todasMetricas: ProjetoMetricas[];
  kpisEstrategicos: KPIEstrategicoCarteira[];
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

/**
 * Gera uma descrição executiva fluida para cada KPI.
 * Exemplos:
 * - "Execução financeira compatível com o plano."
 * - "Ritmo de execução acelerado em relação ao orçamento."
 * - "Não foi possível avaliar a cobertura para o período."
 */
function generateDescricaoExecutiva(
  id: "velocidadeCaixa" | "empenho" | "equilibrioFinanceiro",
  value: number | null,
  status: StatusSemaforo,
  statusLabel: string | null
): string {
  if (status === "nd" || value === null) {
    const msgs: Record<typeof id, string> = {
      velocidadeCaixa: "Não foi possível avaliar o ritmo de execução para o período.",
      empenho: "Não foi possível calcular a cobertura de empenho para o período.",
      equilibrioFinanceiro: "Não foi possível avaliar o equilíbrio financeiro para o período.",
    };
    return msgs[id];
  }

  if (id === "velocidadeCaixa") {
    if (status === "verde") return "Execução financeira compatível com o plano.";
    if (status === "amarelo") return value < 1 
      ? "Ritmo de execução ligeiramente abaixo do orçamento — Acompanhamento recomendado."
      : "Ritmo de execução acelerado em relação ao orçamento.";
    return value < 1
      ? "Ritmo de execução significativamente atrasado — Ação imediata necessária."
      : "Execução em patamar crítico acima do orçamento — Revisão urgente.";
  }

  if (id === "empenho") {
    if (status === "verde") return "Empenho da carteira dentro do esperado para o período.";
    if (status === "amarelo") return value < 1
      ? "Empenho abaixo do esperado — Possível atraso em decisões de compra."
      : "Empenho acelerado — Possível acelução em execução.";
    return value < 1
      ? "Empenho significativamente reduzido — Investigar bloqueios."
      : "Empenho crítico acima da previsão — Avaliar sustentabilidade.";
  }

  // equilibrioFinanceiro
  if (status === "verde") return "Orçamento provisionado em linha com os limites definidos.";
  if (status === "amarelo") return value < 1
    ? "Orçamento com margem de cobertura abaixo do esperado."
    : "Orçamento provisionado acima do limite — Revisar comprometimentos.";
  return value < 1
    ? "Orçamento com cobertura crítica — Ação necessária."
    : "Orçamento com provisão crítica acima do limite — Ação urgente.";
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

export function usePortfolioMetrics(
  parsed: RelatorioParsing | null,
  periodo: Periodo
): PortfolioMetricsResult {
  const todasMetricas = useMemo(() => {
    if (!parsed) return [];
    return withParticipacaoRisco(parsed.projetos.map((p) => computeMetricas(normalizeProjetoBase(p), periodo)));
  }, [parsed, periodo]);

  const kpisEstrategicos = useMemo<KPIEstrategicoCarteira[]>(() => {
    if (todasMetricas.length === 0) {
      return [
        {
          id: "velocidadeCaixa" as const,
          nome: "Velocidade do Caixa",
          valor: null,
          status: "nd" as const,
          statusLabel: "Dados insuficientes",
          descricaoExecutiva: "Não foi possível avaliar o ritmo de execução para o período.",
          direcao: "none" as const,
          meta: "0,90 a 1,10",
          formula: "Realizado Acumulado / Planejado Acumulado",
        },
        {
          id: "empenho" as const,
          nome: "Empenho",
          valor: null,
          status: "nd" as const,
          statusLabel: "Dados insuficientes",
          descricaoExecutiva: "Não foi possível calcular a cobertura de empenho para o período.",
          direcao: "none" as const,
          meta: "0,95 a 1,05",
          formula: "Empenho / (Planejado - Executado - Compromisso)",
        },
        {
          id: "equilibrioFinanceiro" as const,
          nome: "Equilíbrio Financeiro",
          valor: null,
          status: "nd" as const,
          statusLabel: "Dados insuficientes",
          descricaoExecutiva: "Não foi possível avaliar o equilíbrio financeiro para o período.",
          direcao: "none" as const,
          meta: "0,95 a 1,05",
          formula: "Provisionado / Orçamento",
        },
      ];
    }

    const totalRealizado = sumNullable(todasMetricas, (p) => p.realizadoPeriodo);
    const totalPlanejado = sumNullable(todasMetricas, (p) => p.planejadoAcumulado);
    const totalCompromisso = sumNullable(todasMetricas, (p) => p.compromisso);
    const totalExecutado = sumNullable(todasMetricas, (p) => p.executado);
    const totalOrcamento = sumNullable(todasMetricas, (p) => p.orcamentoPeriodo);
    const totalProvisionado =
      totalExecutado !== null || totalCompromisso !== null ? (totalExecutado ?? 0) + (totalCompromisso ?? 0) : null;

    const velocidade = safeDiv(totalRealizado, totalPlanejado);

    // Sem campo explícito de "Empenho" no dataset, usamos "Compromisso" como proxy de empenho carteira.
    const saldoDisponivelEmpenho =
      totalPlanejado !== null && totalExecutado !== null && totalCompromisso !== null
        ? totalPlanejado - totalExecutado - totalCompromisso
        : null;
    // Denominador <= 0 indica carteira estourada — rácio seria irreal; retorna null (N/D).
    const empenho = saldoDisponivelEmpenho !== null && saldoDisponivelEmpenho > 0
      ? safeDiv(totalCompromisso, saldoDisponivelEmpenho)
      : null;

    const equilibrio = safeDiv(totalProvisionado, totalOrcamento);

    const velStatus  = statusByBands(velocidade, 0.9, 1.1, 0.85, 1.15);
    const empStatus  = statusByBands(empenho,    0.95, 1.05, 0.9, 1.1);
    const eqStatus   = statusByBands(equilibrio, 0.95, 1.05, 0.9, 1.1);

    const velLabel = resolveStatusLabel("velocidadeCaixa", velocidade, velStatus);
    const empLabel = resolveStatusLabel("empenho", empenho, empStatus);
    const eqLabel = resolveStatusLabel("equilibrioFinanceiro", equilibrio, eqStatus);

    return [
      {
        id: "velocidadeCaixa" as const,
        nome: "Velocidade do Caixa",
        valor: velocidade,
        status: velStatus,
        statusLabel: velLabel,
        descricaoExecutiva: generateDescricaoExecutiva("velocidadeCaixa", velocidade, velStatus, velLabel),
        direcao: directionByCenter(velocidade, 1),
        meta: "0,90 a 1,10",
        formula: "Realizado Acumulado / Planejado Acumulado",
      },
      {
        id: "empenho" as const,
        nome: "Empenho",
        valor: empenho,
        status: empStatus,
        statusLabel: empLabel,
        descricaoExecutiva: generateDescricaoExecutiva("empenho", empenho, empStatus, empLabel),
        direcao: directionByCenter(empenho, 1),
        meta: "0,95 a 1,05",
        formula: "Empenho / (Planejado - Executado - Compromisso)",
      },
      {
        id: "equilibrioFinanceiro" as const,
        nome: "Equilíbrio Financeiro",
        valor: equilibrio,
        status: eqStatus,
        statusLabel: eqLabel,
        descricaoExecutiva: generateDescricaoExecutiva("equilibrioFinanceiro", equilibrio, eqStatus, eqLabel),
        direcao: directionByCenter(equilibrio, 1),
        meta: "0,95 a 1,05",
        formula: "Provisionado / Orçamento",
      },
    ];
  }, [todasMetricas]);

  return { todasMetricas, kpisEstrategicos };
}
