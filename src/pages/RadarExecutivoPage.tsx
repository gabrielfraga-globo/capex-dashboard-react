import type { KPIEstrategicoCarteira, ProjetoMetricas } from "../types";
import { RadarExecutivo } from "../components/RadarExecutivo";

interface Props {
  lista: ProjetoMetricas[];
  kpisEstrategicos: KPIEstrategicoCarteira[];
  onSelect: (p: ProjetoMetricas) => void;
  isLoadingCompromisso?: boolean;
  dataBase?: string | null;
}

export function RadarExecutivoPage({ lista, kpisEstrategicos, onSelect, isLoadingCompromisso, dataBase }: Props) {
  return <RadarExecutivo lista={lista} kpisEstrategicos={kpisEstrategicos} onSelect={onSelect} isLoadingCompromisso={isLoadingCompromisso} dataBase={dataBase} />;
}
