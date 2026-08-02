import { useMemo } from "react";
import type { ProjetoBase, ProjetoMetricas, RelatorioParsing } from "../types";
import { computeMetricas, withParticipacaoRisco } from "../lib/metrics";
import type { Periodo } from "../types";

interface PortfolioMetricsResult {
  todasMetricas: ProjetoMetricas[];
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

  return { todasMetricas };
}
