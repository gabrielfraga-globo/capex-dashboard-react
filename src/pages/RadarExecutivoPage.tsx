import type { KPIEstrategicoCarteira, ProjetoMetricas } from "../types";
import { RadarExecutivo } from "../components/RadarExecutivo";

interface Props {
  lista: ProjetoMetricas[];
  kpisEstrategicos: KPIEstrategicoCarteira[];
  onSelect: (p: ProjetoMetricas) => void;
  isLoadingCompromisso?: boolean;
}

export function RadarExecutivoPage({ lista, kpisEstrategicos, onSelect, isLoadingCompromisso }: Props) {
  return <RadarExecutivo lista={lista} kpisEstrategicos={kpisEstrategicos} onSelect={onSelect} isLoadingCompromisso={isLoadingCompromisso} />;
}
