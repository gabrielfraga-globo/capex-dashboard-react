import { useEffect, useMemo, useState } from "react";
import type { ProjetoMetricas, RelatorioParsing } from "./types";
import { useFilterStore } from "./store/filterStore";
import { useThemeStore } from "./store/themeStore";
import { computeMetricas, withParticipacaoRisco } from "./lib/metrics";
import { loadPortfolioData } from "./lib/dataSource";
import { FilterBar } from "./components/FilterBar";
import { ContextBar } from "./components/ContextBar";
import { ExecutiveSummary } from "./components/ExecutiveSummary";
import { Destaques } from "./components/Destaques";
import { RadarExecutivo } from "./components/RadarExecutivo";
import { RiskMatrix } from "./components/RiskMatrix";
import { DistribuicaoFinanceiraPlataforma } from "./components/Diagnostics";
import { Rankings } from "./components/Rankings";
import { ActionPlan } from "./components/ActionPlan";
import { ProjectsTable } from "./components/ProjectsTable";
import { ProjectSidePanel } from "./components/ProjectSidePanel";
import { ValidationPanel } from "./components/ValidationPanel";
import { BentoCard } from "./components/ui/bento";
import { BrandMark } from "./components/ui/BrandMark";
import { ThemeToggle } from "./components/ui/ThemeToggle";
import { Loader2, AlertTriangle, ShieldCheck, Radar, ClipboardList } from "lucide-react";

type ViewMode = "radar" | "auditoria";

export default function App() {
  const [parsed, setParsed] = useState<RelatorioParsing | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProjetoMetricas | null>(null);
  const [modoAuditoria, setModoAuditoria] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("radar");
  const filtros = useFilterStore();
  const { theme } = useThemeStore();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);


  useEffect(() => {
    loadPortfolioData()
      .then(setParsed)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Falha ao carregar os dados da carteira."));
  }, []);

  const todasMetricas = useMemo(() => {
    if (!parsed) return [];
    return withParticipacaoRisco(parsed.projetos.map((p) => computeMetricas(p, filtros.periodo)));
  }, [parsed, filtros.periodo]);

  const metricasFiltradas = useMemo(() => {
    return todasMetricas.filter((p) => {
      if (filtros.plataforma && p.n4Curta !== filtros.plataforma) return false;
      if (filtros.gestor && p.gestor !== filtros.gestor) return false;
      if (filtros.aprovador && p.aprovador !== filtros.aprovador) return false;
      if (filtros.status && p.status !== filtros.status) return false;
      if (filtros.busca && !p.nome.toLowerCase().includes(filtros.busca.toLowerCase())) return false;
      if ((filtros.execucaoMin !== 0 || filtros.execucaoMax !== 100) && p.pctExecucao !== null) {
        const pct = p.pctExecucao * 100;
        if (pct < filtros.execucaoMin || pct > filtros.execucaoMax) return false;
      }
      if ((filtros.comprometimentoMin !== 0 || filtros.comprometimentoMax !== 100) && p.pctComprometimento !== null) {
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

  const periodoLabel = { "2026": "Orçamento 2026", "2027": "Orçamento 2027", "Todos": "Consolidado 2026–2027" }[filtros.periodo];

  // Selecionar um projeto abre o painel lateral (com o detalhe técnico completo) como
  // overlay — a tela de fundo (Radar ou Auditoria) NÃO muda, preservando o contexto de
  // navegação. Fechar o painel volta exatamente para onde o usuário estava.
  const handleSelectFromRadar = (p: ProjetoMetricas) => {
    setSelected(p);
  };

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-4">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto text-risk-critico mb-3" size={32} />
          <p className="text-text font-semibold mb-1">Não foi possível carregar a carteira</p>
          <p className="text-text-muted text-sm">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!parsed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-3 text-text-muted">
          <Loader2 className="animate-spin text-accent" size={28} />
          <span className="text-sm">Carregando carteira…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text px-4 md:px-8 py-5 max-w-[1400px] mx-auto">
      <header className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <BrandMark size={28} />
          <div>
            <h1 className="text-lg font-bold leading-tight">Carteira CAPEX</h1>
            <p className="text-[11px] text-text-muted">
              {viewMode === "radar" ? "Radar Executivo" : "Auditoria da Carteira"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {/* Navegação entre as duas experiências */}
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setViewMode("radar")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === "radar" ? "bg-accent text-white" : "bg-card-alt text-text-muted hover:text-text"
              }`}
            >
              <Radar size={13} /> Radar Executivo
            </button>
            <button
              onClick={() => setViewMode("auditoria")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === "auditoria" ? "bg-accent text-white" : "bg-card-alt text-text-muted hover:text-text"
              }`}
            >
              <ClipboardList size={13} /> Auditoria da Carteira
            </button>
          </div>
          {viewMode === "auditoria" && (
            <button
              onClick={() => setModoAuditoria((v) => !v)}
              className={`flex items-center gap-1.5 text-xs rounded-md border px-3 py-1.5 transition-colors ${
                modoAuditoria ? "border-accent text-accent bg-accent/10" : "border-border text-text-muted hover:text-text"
              }`}
            >
              <ShieldCheck size={13} /> Validação Técnica
            </button>
          )}
        </div>
      </header>

      <ContextBar parsed={parsed} totalFiltrado={metricasFiltradas.length} totalGeral={todasMetricas.length} periodoLabel={periodoLabel} />

      {viewMode === "auditoria" && (
        <div className="flex gap-2 mb-4">
          {(["2026", "2027", "Todos"] as const).map((p) => (
            <button
              key={p}
              onClick={() => filtros.setPeriodo(p)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                filtros.periodo === p ? "bg-accent text-white" : "bg-card-alt text-text-muted hover:text-text"
              }`}
            >
              {p === "Todos" ? "🗂️ Todos os anos" : `📅 ${p}`}
            </button>
          ))}
        </div>
      )}

      {viewMode === "radar" ? (
        <RadarExecutivo lista={metricasFiltradas} onSelect={handleSelectFromRadar} />
      ) : (
        <>
          <FilterBar projetos={parsed.projetos} />

          <ExecutiveSummary lista={metricasFiltradas} periodo={filtros.periodo} />

          <div className="space-y-3 mb-6">
            <BentoCard title="Destaques" icon="🎯">
              <Destaques lista={metricasFiltradas} onSelect={setSelected} />
            </BentoCard>

            <BentoCard title="Matriz de Risco" icon="🧭">
              <RiskMatrix lista={metricasFiltradas} onSelect={setSelected} />
            </BentoCard>

            <BentoCard title="Composição por Plataforma" icon="🏗️">
              <DistribuicaoFinanceiraPlataforma lista={metricasFiltradas} />
            </BentoCard>

            <BentoCard title="Projetos Prioritários" icon="📋">
              <Rankings lista={metricasFiltradas} onSelect={setSelected} />
            </BentoCard>

            <BentoCard title="Plano de Ação" icon="✅">
              <ActionPlan lista={metricasFiltradas} onSelect={setSelected} />
            </BentoCard>

            <BentoCard title="Detalhamento Completo" icon="🗂️" tooltip="Tabela completa, ordenável e exportável.">
              <ProjectsTable lista={metricasFiltradas} onSelect={setSelected} />
            </BentoCard>
          </div>

          {modoAuditoria && (
            <ValidationPanel metricas2026={metricas2026} parsed={parsed} totalGeralProjetos={parsed.projetos.length} />
          )}
        </>
      )}

      <footer className="text-center text-[11px] text-text-faint py-4">
        Performance Plataformas · Radar Executivo Mensal · Uso Interno
      </footer>

      <ProjectSidePanel projeto={selected} comparaveis={comparaveis} onClose={() => setSelected(null)} />
    </div>
  );
}
