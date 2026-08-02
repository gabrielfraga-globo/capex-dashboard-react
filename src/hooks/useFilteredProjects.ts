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
  const {
    plataforma, gestor, aprovador, status, busca,
    execucaoMin, execucaoMax, comprometimentoMin, comprometimentoMax,
  } = filtros;

  const metricasFiltradas = useMemo(() => {
    return todasMetricas.filter((p) => {
      if (plataforma && p.n4Curta !== plataforma) return false;
      if (gestor && p.gestor !== gestor) return false;
      if (aprovador && p.aprovador !== aprovador) return false;
      if (status && p.status !== status) return false;
      if (busca && !p.nome.toLowerCase().includes(busca.toLowerCase())) return false;
      if ((execucaoMin !== 0 || execucaoMax !== 100) && p.pctExecucao !== null) {
        const pct = p.pctExecucao * 100;
        if (pct < execucaoMin || pct > execucaoMax) return false;
      }
      if ((comprometimentoMin !== 0 || comprometimentoMax !== 100) && p.pctComprometimento !== null) {
        const pct = p.pctComprometimento * 100;
        if (pct < comprometimentoMin || pct > comprometimentoMax) return false;
      }
      return true;
    });
  // Deps primitivas garantem que o useMemo só roda quando um valor de filtro muda
  }, [todasMetricas, plataforma, gestor, aprovador, status, busca, execucaoMin, execucaoMax, comprometimentoMin, comprometimentoMax]);

  const comparaveis = useMemo(() => {
    if (!selected) return [];
    return metricasFiltradas.filter(
      (p) => p.n4Curta === selected.n4Curta && p.id !== selected.id
    );
  }, [selected, metricasFiltradas]);

  const periodoLabel = useMemo(() => PERIODO_LABEL[filtros.periodo], [filtros.periodo]);

  return { metricasFiltradas, comparaveis, periodoLabel };
}
