import { useMemo, useState } from "react";
import type { ProjetoMetricas, RelatorioParsing } from "./types";
import { useFilterStore } from "./store/filterStore";
import { computeMetricas, withParticipacaoRisco } from "./lib/metrics";
import { FileUpload } from "./components/FileUpload";
import { FilterBar } from "./components/FilterBar";
import { ContextBar } from "./components/ContextBar";
import { ExecutiveSummary } from "./components/ExecutiveSummary";
import { InsightsPanel } from "./components/InsightsPanel";
import { Diagnostics } from "./components/Diagnostics";
import { Rankings } from "./components/Rankings";
import { ActionPlan } from "./components/ActionPlan";
import { ProjectsTable } from "./components/ProjectsTable";
import { ProjectSidePanel } from "./components/ProjectSidePanel";
import { ValidationPanel } from "./components/ValidationPanel";
import { RotateCcw } from "lucide-react";

export default function App() {
  const [parsed, setParsed] = useState<RelatorioParsing | null>(null);
  const [selected, setSelected] = useState<ProjetoMetricas | null>(null);
  const filtros = useFilterStore();

  const todasMetricas = useMemo(() => {
    if (!parsed) return [];
    return withParticipacaoRisco(parsed.projetos.map((p) => computeMetricas(p, filtros.periodo)));
  }, [parsed, filtros.periodo]);

  const metricasFiltradas = useMemo(() => {
    return todasMetricas.filter((p) => {
      if (filtros.plataforma && p.n4Curta !== filtros.plataforma) return false;
      if (filtros.gestor && p.gestor !== filtros.gestor) return false;
      if (filtros.aprovador && p.aprovador !== filtros.aprovador) return false;
      if (filtros.projeto && p.nome !== filtros.projeto) return false;
      if (filtros.status && p.status !== filtros.status) return false;
      if (filtros.busca && !p.nome.toLowerCase().includes(filtros.busca.toLowerCase())) return false;
      if (p.pctExecucao !== null) {
        const pct = p.pctExecucao * 100;
        if (pct < filtros.execucaoMin || pct > filtros.execucaoMax) return false;
      }
      if (p.pctComprometimento !== null) {
        const pct = p.pctComprometimento * 100;
        if (pct < filtros.comprometimentoMin || pct > filtros.comprometimentoMax) return false;
      }
      return true;
    });
  }, [todasMetricas, filtros]);

  const metricas2026 = useMemo(() => {
    if (!parsed) return [];
    return withParticipacaoRisco(parsed.projetos.map((p) => computeMetricas(p, "2026")));
  }, [parsed]);

  const comparaveis = useMemo(() => {
    if (!selected) return [];
    return metricasFiltradas.filter((p) => p.n4Curta === selected.n4Curta && p.id !== selected.id);
  }, [selected, metricasFiltradas]);

  if (!parsed) {
    return <FileUpload onLoaded={setParsed} />;
  }

  return (
    <div className="min-h-screen bg-bg text-text px-4 md:px-8 py-6 max-w-[1500px] mx-auto">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">📊 Carteira CAPEX — Plataformas de Produção</h1>
          <p className="text-xs text-text-muted">Dashboard executivo de fluxo de caixa</p>
        </div>
        <button
          onClick={() => setParsed(null)}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text rounded-md border border-border px-3 py-1.5"
        >
          <RotateCcw size={13} /> Carregar outro arquivo
        </button>
      </header>

      <ContextBar
        parsed={parsed}
        filtros={filtros}
        totalFiltrado={metricasFiltradas.length}
        totalGeral={todasMetricas.length}
      />
      <FilterBar projetos={parsed.projetos} />

      <ExecutiveSummary lista={metricasFiltradas} periodo={filtros.periodo} />
      <InsightsPanel lista={metricasFiltradas} />
      <Diagnostics lista={metricasFiltradas} periodo={filtros.periodo} />
      <Rankings lista={metricasFiltradas} onSelect={setSelected} />
      <ActionPlan lista={metricasFiltradas} onSelect={setSelected} />
      <ProjectsTable lista={metricasFiltradas} onSelect={setSelected} />
      <ValidationPanel metricas2026={metricas2026} parsed={parsed} totalGeralProjetos={parsed.projetos.length} />

      <footer className="text-center text-[11px] text-text-faint py-4">
        Processamento 100% local no navegador — nenhum dado enviado a servidores externos · Dashboard executivo · Uso interno
      </footer>

      <ProjectSidePanel projeto={selected} comparaveis={comparaveis} onClose={() => setSelected(null)} />
    </div>
  );
}
