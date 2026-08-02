import { useMemo } from "react";
import type { ProjetoMetricas, RelatorioParsing } from "../types";
import { computeMetricas, withParticipacaoRisco } from "../lib/metrics";
import type { Periodo } from "../types";

interface PortfolioMetricsResult {
  todasMetricas: ProjetoMetricas[];
  metricas2026: ProjetoMetricas[];
}

export function usePortfolioMetrics(
  parsed: RelatorioParsing | null,
  periodo: Periodo
): PortfolioMetricsResult {
  const todasMetricas = useMemo(() => {
    if (!parsed) return [];
    return withParticipacaoRisco(parsed.projetos.map((p) => computeMetricas(p, periodo)));
  }, [parsed, periodo]);

  const metricas2026 = useMemo(() => {
    if (!parsed) return [];
    return withParticipacaoRisco(parsed.projetos.map((p) => computeMetricas(p, "2026")));
  }, [parsed]);

  return { todasMetricas, metricas2026 };
}
