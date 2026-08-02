import type { ProjetoMetricas } from "../types";
import { RadarExecutivo } from "../components/RadarExecutivo";

interface Props {
  lista: ProjetoMetricas[];
  onSelect: (p: ProjetoMetricas) => void;
}

export function RadarExecutivoPage({ lista, onSelect }: Props) {
  return <RadarExecutivo lista={lista} onSelect={onSelect} />;
}
