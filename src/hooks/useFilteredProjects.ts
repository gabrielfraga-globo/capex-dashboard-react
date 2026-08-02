import { useMemo } from "react";
import type { ProjetoMetricas, FiltrosState, Periodo } from "../types";

const PERIODO_LABEL: Record<Periodo, string> = {
  "2026": "Orçamento 2026",
  "2027": "Orçamento 2027",
  Todos: "Consolidado 2026–2027",
};

interface FilteredProjectsResult {
  metricasFiltradas: ProjetoMetricas[];
  comparaveis: ProjetoMetricas[];
  periodoLabel: string;
}

export function useFilteredProjects(
  todasMetricas: ProjetoMetricas[],
  filtros: FiltrosState,
  selected: ProjetoMetricas | null
): FilteredProjectsResult {
  const metricasFiltradas = useMemo(() => {
    return todasMetricas.filter((p) => {
      if (filtros.plataforma && p.n4Curta !== filtros.plataforma) return false;
      if (filtros.gestor && p.gestor !== filtros.gestor) return false;
      if (filtros.aprovador && p.aprovador !== filtros.aprovador) return false;
      if (filtros.status && p.status !== filtros.status) return false;
      if (filtros.busca && !p.nome.toLowerCase().includes(filtros.busca.toLowerCase()))
        return false;
      if (
        (filtros.execucaoMin !== 0 || filtros.execucaoMax !== 100) &&
        p.pctExecucao !== null
      ) {
        const pct = p.pctExecucao * 100;
        if (pct < filtros.execucaoMin || pct > filtros.execucaoMax) return false;
      }
      if (
        (filtros.comprometimentoMin !== 0 || filtros.comprometimentoMax !== 100) &&
        p.pctComprometimento !== null
      ) {
        const pct = p.pctComprometimento * 100;
        if (pct < filtros.comprometimentoMin || pct > filtros.comprometimentoMax)
          return false;
      }
      return true;
    });
  }, [todasMetricas, filtros]);

  const comparaveis = useMemo(() => {
    if (!selected) return [];
    return metricasFiltradas.filter(
      (p) => p.n4Curta === selected.n4Curta && p.id !== selected.id
    );
  }, [selected, metricasFiltradas]);

  const periodoLabel = PERIODO_LABEL[filtros.periodo];

  return { metricasFiltradas, comparaveis, periodoLabel };
}
