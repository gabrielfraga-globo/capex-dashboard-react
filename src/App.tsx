import { useState, lazy, Suspense, useCallback } from "react";
import type { ProjetoMetricas, FiltrosState } from "./types";
import { useFilterStore } from "./store/filterStore";
import { useShallow } from "zustand/react/shallow";
import { useThemeStore } from "./store/themeStore";
import { usePortfolioData } from "./hooks/usePortfolioData";
import { usePortfolioMetrics, useKpisEstrategicos } from "./hooks/usePortfolioMetrics";
import { useFilteredProjects } from "./hooks/useFilteredProjects";
import { useThemeSync } from "./hooks/useThemeSync";
import { ContextBar } from "./components/ContextBar";
import { ProjectSidePanel } from "./components/ProjectSidePanel";
import { BrandMark } from "./components/ui/BrandMark";
import { ThemeToggle } from "./components/ui/ThemeToggle";
import { RadarExecutivoPage } from "./pages/RadarExecutivoPage";
import { AlertTriangle, Radar, ClipboardList } from "lucide-react";
import { SkeletonRadar } from "./components/ui/SkeletonCard";
import { Analytics } from "@vercel/analytics/react";

// Lazy: o bundle da Auditoria só é baixado quando o usuário navega para essa aba
const AuditoriaCarteiraPage = lazy(() =>
  import("./pages/AuditoriaCarteiraPage").then((m) => ({ default: m.AuditoriaCarteiraPage }))
);

type ViewMode = "radar" | "auditoria";

// Badge M-1: período de referência executivo (mês anterior fechado), calculado uma vez.
const _hoje = new Date();
const _mesRefIdx = _hoje.getMonth() === 0 ? 11 : _hoje.getMonth() - 1; // 0-indexed
const _anoRef = _hoje.getMonth() === 0 ? _hoje.getFullYear() - 1 : _hoje.getFullYear();
const _MESES_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const PERIODO_M1_LABEL = `${_MESES_PT[_mesRefIdx]} / ${_anoRef}`;

export default function App() {
  const [selected, setSelected] = useState<ProjetoMetricas | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("radar");

  // Seletores granulares — App.tsx só re-renderiza quando os valores que ele usa mudam
  const filtros = useFilterStore(
    useShallow((s): FiltrosState => ({
      periodo: s.periodo,
      plataforma: s.plataforma,
      gestor: s.gestor,
      projeto: s.projeto,
      aprovador: s.aprovador,
      status: s.status,
      execucaoMin: s.execucaoMin,
      execucaoMax: s.execucaoMax,
      comprometimentoMin: s.comprometimentoMin,
      comprometimentoMax: s.comprometimentoMax,
      busca: s.busca,
    }))
  );
  const setPeriodo = useFilterStore(s => s.setPeriodo);
  const theme = useThemeStore(s => s.theme);

  useThemeSync(theme);

  const { parsed, isLoadingCompromisso, loadError } = usePortfolioData();
  const { todasMetricas } = usePortfolioMetrics(parsed, filtros.periodo);
  const { metricasFiltradas, comparaveis, periodoLabel } = useFilteredProjects(
    todasMetricas,
    filtros,
    selected
  );
  // KPIs reagem aos filtros: calculados a partir da lista filtrada, não da base bruta.
  const kpisEstrategicos = useKpisEstrategicos(metricasFiltradas);

  // Overlay do painel lateral não altera a view ativa, preservando contexto de navegação.
  const handleSelectFromRadar = useCallback((p: ProjetoMetricas) => setSelected(p), []);
  const handleClosePanel = useCallback(() => setSelected(null), []);

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-4">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto text-risk-critico mb-3" size={32} aria-hidden="true" />
          <p className="text-text font-semibold mb-1">Não foi possível carregar a carteira</p>
          <p className="text-text-muted text-sm mb-4">{loadError}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-text-muted hover:text-text hover:border-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }


  if (!parsed) {
    return (
      <div className="min-h-screen bg-bg px-4 md:px-8 py-5 max-w-[1400px] mx-auto">
        <div className="h-12 mb-4 rounded-card bg-card-alt animate-pulse" aria-hidden="true" />
        <SkeletonRadar />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text px-4 md:px-8 py-5 max-w-[1400px] mx-auto">
      <header className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <BrandMark size={28} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold leading-tight">Carteira CAPEX</h1>
              <span
                className="rounded border border-accent/50 bg-accent/10 text-accent text-[11px] font-bold px-2 py-0.5 tracking-wide"
                title="Período de referência: mês anterior fechado (M-1)"
              >
                [ {PERIODO_M1_LABEL} ]
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {/* Navegação entre as duas experiências */}
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setViewMode("radar")}
              aria-pressed={viewMode === "radar"}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70 ${
                viewMode === "radar" ? "bg-accent text-white" : "bg-card-alt text-text-muted hover:text-text"
              }`}
            >
              <Radar size={13} aria-hidden="true" /> Radar Executivo
            </button>
            <button
              onClick={() => setViewMode("auditoria")}
              aria-pressed={viewMode === "auditoria"}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70 ${
                viewMode === "auditoria" ? "bg-accent text-white" : "bg-card-alt text-text-muted hover:text-text"
              }`}
            >
              <ClipboardList size={13} aria-hidden="true" /> Auditoria Detalhada
            </button>
          </div>
        </div>
      </header>

      <ContextBar
        parsed={parsed}
        periodoLabel={periodoLabel}
      />

      {viewMode === "radar" ? (
        <RadarExecutivoPage lista={metricasFiltradas} kpisEstrategicos={kpisEstrategicos} onSelect={handleSelectFromRadar} isLoadingCompromisso={isLoadingCompromisso} />
      ) : (
        <Suspense fallback={
          <div role="status" aria-label="Carregando Auditoria da Carteira…" className="space-y-3 py-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-card border border-border bg-card-alt animate-pulse h-16" aria-hidden="true" />
            ))}
          </div>
        }>
          <AuditoriaCarteiraPage
            metricasFiltradas={metricasFiltradas}
            parsed={parsed}
            periodo={filtros.periodo}
            onSetPeriodo={setPeriodo}
            onSelect={setSelected}
          />
        </Suspense>
      )}

      <footer className="text-center text-[11px] text-text-faint py-4">
        Performance Plataformas · Fechamento Mensal · Uso Interno
      </footer>

      <ProjectSidePanel projeto={selected} comparaveis={comparaveis} onClose={handleClosePanel} />
      <Analytics />
    </div>
  );
}
