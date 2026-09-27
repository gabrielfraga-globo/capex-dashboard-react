import type { KPIEstrategicoCarteira, ProjetoMetricas } from "../types";
import { FluxoCaixaChart } from "../components/FluxoCaixaChart";
import { HomeExecutive } from "../features/radar/HomeExecutive";

interface Props {
  lista: ProjetoMetricas[];
  /** mantido na assinatura; os KPIs estratégicos agora vivem na Auditoria */
  kpisEstrategicos: KPIEstrategicoCarteira[];
  onSelect: (p: ProjetoMetricas) => void;
  isLoadingCompromisso?: boolean;
  dataBase?: string | null;
}

/** Início V2: insights, KPI principal, secundários, principais problemas e fluxo compacto, sem rolagem em lg+. */
export function RadarExecutivoPage({ lista, onSelect, isLoadingCompromisso, dataBase }: Props) {
  return (
    <div className="h-[calc(100vh-10.75rem)] min-h-[600px] max-lg:h-auto overflow-hidden max-lg:overflow-visible">
      <HomeExecutive
        lista={lista}
        dataBase={dataBase ?? null}
        onSelectProject={onSelect}
        fluxo={<FluxoCaixaChart lista={lista} dataBase={dataBase ?? null} isLoadingCompromisso={isLoadingCompromisso} compact />}
      />
    </div>
  );
}
