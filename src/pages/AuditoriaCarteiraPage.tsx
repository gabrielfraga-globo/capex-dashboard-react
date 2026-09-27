import type { Periodo, ProjetoMetricas, RelatorioParsing } from "../types";
import { FilterBar } from "../components/FilterBar";
import { ExecutiveSummary } from "../components/ExecutiveSummary";
import { Destaques } from "../components/Destaques";
import { RiskMatrix } from "../components/RiskMatrix";
import { DistribuicaoFinanceiraPlataforma } from "../components/Diagnostics";
import { Rankings } from "../components/Rankings";
import { ActionPlan } from "../components/ActionPlan";
import { ProjectsTable } from "../components/ProjectsTable";
import { BentoCard } from "../components/ui/bento";
import { ExecucaoPlanoCard } from "../components/ExecucaoPlanoCard";
import { AnaliseRiscoPanel } from "../components/AnaliseRiscoPanel";
import type { KPIEstrategicoCarteira } from "../types";

interface Props {
  metricasFiltradas: ProjetoMetricas[];
  parsed: RelatorioParsing;
  periodo: Periodo;
  onSetPeriodo: (p: Periodo) => void;
  onSelect: (p: ProjetoMetricas | null) => void;
  kpisEstrategicos?: KPIEstrategicoCarteira[];
  isLoadingCompromisso?: boolean;
  dataBase?: string | null;
}

export function AuditoriaCarteiraPage({
  metricasFiltradas,
  parsed,
  periodo,
  onSetPeriodo,
  onSelect,
  kpisEstrategicos = [],
  isLoadingCompromisso,
}: Props) {
  return (
    <>
      <div className="flex gap-2 mb-4">
        {(["2026", "2027", "Todos"] as const).map((p) => (
          <button
            key={p}
            onClick={() => onSetPeriodo(p)}
            aria-pressed={periodo === p}
            className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${
              periodo === p ? "bg-accent text-white" : "bg-card-alt text-text-muted hover:text-text"
            }`}
          >
            {p === "Todos" ? "🗂️ Todos os anos" : `📅 ${p}`}
          </button>
        ))}
      </div>

      <FilterBar projetos={parsed.projetos} />

      <ExecutiveSummary lista={metricasFiltradas} periodo={periodo} />

      <div className="grid grid-cols-12 gap-4 mb-6 max-lg:grid-cols-1">
        <div className="col-span-7 max-lg:col-span-1">
          <ExecucaoPlanoCard lista={metricasFiltradas} />
        </div>
        <div className="col-span-5 max-lg:col-span-1">
          <AnaliseRiscoPanel
            lista={metricasFiltradas}
            kpisEstrategicos={kpisEstrategicos}
            isLoadingCompromisso={isLoadingCompromisso}
            onSelectProject={onSelect}
          />
        </div>
      </div>

      <div className="space-y-3 mb-6">
        <BentoCard title="Destaques" icon="🎯">
          <Destaques lista={metricasFiltradas} onSelect={onSelect} />
        </BentoCard>

        <BentoCard title="Matriz de Risco" icon="🧭">
          <RiskMatrix lista={metricasFiltradas} onSelect={onSelect} />
        </BentoCard>

        <BentoCard title="Composição por Plataforma" icon="🏗️">
          <DistribuicaoFinanceiraPlataforma lista={metricasFiltradas} />
        </BentoCard>

        <BentoCard title="Projetos Prioritários" icon="📋">
          <Rankings lista={metricasFiltradas} onSelect={onSelect} />
        </BentoCard>

        <BentoCard title="Plano de Ação" icon="✅">
          <ActionPlan lista={metricasFiltradas} onSelect={onSelect} />
        </BentoCard>

        <BentoCard title="Detalhamento Completo" icon="🗂️" tooltip="Tabela completa, ordenável e exportável.">
          <ProjectsTable lista={metricasFiltradas} onSelect={onSelect} />
        </BentoCard>
      </div>
    </>
  );
}
