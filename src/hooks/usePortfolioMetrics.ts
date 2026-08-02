import { useMemo } from "react";
import type { KPIEstrategicoCarteira, ProjetoBase, ProjetoMetricas, RelatorioParsing, StatusSemaforo } from "../types";
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
  if (value === null || status === "nd") return null;
  const map = STATUS_LABEL[id];
  if (status === "verde") return map.verde;
  return value < 1 ? map.baixo : map.alto;
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
          statusLabel: null,
          direcao: "none" as const,
          meta: "0,90 a 1,10",
          formula: "Realizado / Planejado",
        },
        {
          id: "empenho" as const,
          nome: "Empenho",
          valor: null,
          status: "nd" as const,
          statusLabel: null,
          direcao: "none" as const,
          meta: "0,95 a 1,05",
          formula: "Empenho / (Planejado - Executado - Compromisso)",
        },
        {
          id: "equilibrioFinanceiro" as const,
          nome: "Equilíbrio Financeiro",
          valor: null,
          status: "nd" as const,
          statusLabel: null,
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

    return [
      {
        id: "velocidadeCaixa" as const,
        nome: "Velocidade do Caixa",
        valor: velocidade,
        status: velStatus,
        statusLabel: resolveStatusLabel("velocidadeCaixa", velocidade, velStatus),
        direcao: directionByCenter(velocidade, 1),
        meta: "0,90 a 1,10",
        formula: "Realizado / Planejado",
      },
      {
        id: "empenho" as const,
        nome: "Empenho",
        valor: empenho,
        status: empStatus,
        statusLabel: resolveStatusLabel("empenho", empenho, empStatus),
        direcao: directionByCenter(empenho, 1),
        meta: "0,95 a 1,05",
        formula: "Empenho / (Planejado - Executado - Compromisso)",
      },
      {
        id: "equilibrioFinanceiro" as const,
        nome: "Equilíbrio Financeiro",
        valor: equilibrio,
        status: eqStatus,
        statusLabel: resolveStatusLabel("equilibrioFinanceiro", equilibrio, eqStatus),
        direcao: directionByCenter(equilibrio, 1),
        meta: "0,95 a 1,05",
        formula: "Provisionado / Orçamento",
      },
    ];
  }, [todasMetricas]);

  return { todasMetricas, kpisEstrategicos };
}
