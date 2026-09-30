import { useState, useMemo } from "react";
import {
  FolderKanban, Wallet, ShieldAlert, Gauge, Filter
} from "lucide-react";
import type { KPIEstrategicoCarteira, ProjetoMetricas } from "../types";
import { fmtBRL, fmtPct } from "../lib/format";
import { navigate } from "../lib/simpleRouter";
import { useCuration } from "../features/radar/useCuration";
import {
  buildProjectBalances,
  summarizeBalances,
  buildProjectsAtRisk,
  buildCurationConsistency,
  sumProvisioned,
  buildBridge,
  buildBottleneck,
  buildInsights,
  buildFlowSummary,
  buildBgVivo
} from "../features/radar/executive";
import { buildOperationalRows } from "../features/radar/operational";
import { normalizeKey } from "../lib/csvProcessingCore";
import { ExecucaoPlanoCard } from "../components/ExecucaoPlanoCard";
import { FluxoCaixaChart } from "../components/FluxoCaixaChart";
import { RiskPanel } from "../features/radar/panels/RiskPanel";
import { EstouroPanel } from "../features/radar/panels/EstouroPanel";
import { BalancesPanel } from "../features/radar/panels/BalancesPanel";
import { BridgePanel } from "../features/radar/panels/BridgePanel";
import { KpiStat } from "../components/ui/pattern/KpiStat";
import { SectionCard } from "../components/ui/pattern/SectionCard";
import { AnaliseRiscoPanel } from "../components/AnaliseRiscoPanel";
import { Select } from "../components/ui/select";

function parseDateBR(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day)
  ) return null;
  return parsed;
}

interface Props {
  lista: ProjetoMetricas[];
  kpisEstrategicos: KPIEstrategicoCarteira[];
  onSelect: (p: ProjetoMetricas) => void;
  isLoadingCompromisso?: boolean;
  dataBase?: string | null;
}

type Panel = "risk" | "balances" | "bridge" | "estouro" | null;

export function RadarExecutivoPage({
  lista,
  kpisEstrategicos,
  onSelect,
  isLoadingCompromisso,
  dataBase,
}: Props) {
  const { bundle, curationMap } = useCuration();
  const [panel, setPanel] = useState<Panel>(null);
  
  const [ano, setAno] = useState<2026 | 2027>(2026);
  const [filtroPrograma, setFiltroPrograma] = useState<string | null>(null);
  const [filtroRubrica, setFiltroRubrica] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const programasOptions = useMemo(() => {
    const set = new Set(lista.map(p => p.n4Curta).filter(Boolean));
    return Array.from(set).sort().map(p => ({ value: p, label: p }));
  }, [lista]);

  const computed = useMemo(() => {
    if (!bundle) return null;
    const dbDate = parseDateBR(dataBase) || new Date();
    const referenceDateStr = dbDate.toISOString().slice(0, 10);

    const listaFiltradaBase = lista.filter(p => !filtroPrograma || p.n4Curta === filtroPrograma);
    
    // Lista adaptada para o ano selecionado, garantindo que métricas do período batam
    const listaAno = listaFiltradaBase.map(p => ({
      ...p,
      orcamentoPeriodo: ano === 2026 ? p.orcamento2026 : p.orcamento2027,
      realizadoAcumulado: ano === 2026 ? p.realizado2026 : p.realizado2027,
      executado: ano === 2026 ? (p.realizado2026 ?? 0) + (p.emPagamento2026 ?? 0) : (p.realizado2027 ?? 0) + (p.emPagamento2027 ?? 0)
    }));

    const listaAno26 = listaFiltradaBase.map(p => ({
      ...p,
      orcamentoPeriodo: p.orcamento2026,
      realizadoAcumulado: p.realizado2026,
      executado: (p.realizado2026 ?? 0) + (p.emPagamento2026 ?? 0)
    }));

    const validKeys = new Set(listaAno.map((p) => `${normalizeKey(p.n4)}|${normalizeKey(p.nome)}`));
    const allOpRows = buildOperationalRows(bundle, curationMap, referenceDateStr);
    
    let opRows = allOpRows.filter((row) => {
      const commitments = bundle.commitments.filter((c: any) => c.rc === row.rc);
      return commitments.some((c: any) => validKeys.has(`${normalizeKey(c.n4)}|${normalizeKey(c.projectName)}`));
    });

    // Se a rubrica estivesse disponível, filtraríamos opRows aqui
    if (filtroRubrica) {
      // opRows = opRows.filter(...) - indisponível na base atual
    }

    const projectBalances = buildProjectBalances(listaAno, bundle.projectActivity, dbDate);
    const balanceSummary = summarizeBalances(projectBalances);
    const risk = buildProjectsAtRisk(opRows);
    const consistency = buildCurationConsistency(opRows, dbDate, bundle.exerciseYear);
    const { prov26, provRisco, prov27 } = sumProvisioned(opRows);

    let totalRealizado = 0, totalEmPagamento = 0, bgSistemico = 0;
    for (const p of listaAno) {
      totalRealizado += p.realizado2026 ?? 0;
      totalEmPagamento += p.emPagamento2026 ?? 0;
      bgSistemico += p.orcamento2026 ?? 0;
    }

    let residual = 0, naoOcorre = 0;
    for (const r of opRows) {
      if (r.stage === "RESIDUAL" || r.stage === "DESCONHECIDA") residual += r.value;
      else if (r.classification === "NAO_OCORRE") naoOcorre += r.value;
    }

    const bridge = buildBridge({
      bg: bgSistemico, realizado: totalRealizado, emPagamento: totalEmPagamento,
      prov26, provRisco, prov27, residual, naoOcorre, saldoLiquido: balanceSummary.liquido,
    });
    const bottleneck = buildBottleneck(opRows);
    const pendente = Math.max(0, consistency.scopeValue - opRows.filter((r) => r.isClassificationConfirmed).reduce((s, r) => s + r.value, 0));
    buildInsights({
      bgSistemico, projetado: totalRealizado + totalEmPagamento + prov26,
      realizado: totalRealizado, emPagamento: totalEmPagamento,
      projetosEmRiscoCount: risk.count, projetosEmRiscoValue: risk.totalValue, top10RiscoValue: risk.top10Value,
      dataBase: dbDate, opRows,
      saldoParadoValue: bundle.projectActivity ? balanceSummary.parado.value : 0,
      curadoriaPendenteValue: consistency.scopeCount > consistency.confirmed ? pendente : 0,
    });
    
    const bgVivoSum = buildBgVivo(listaAno, opRows, ano);

    const flow = buildFlowSummary(listaAno);

    return {
      bgSistemico, totalRealizado, totalEmPagamento, prov26, provRisco, prov27,
      balanceSummary, projectBalances, risk, bridge, bottleneck,
      flow, listaAno, listaAno26, bgVivoSum
    };
  }, [bundle, curationMap, lista, dataBase, ano, filtroPrograma, filtroRubrica]);

  const handleSelectByKey = (key: string) => {
    const proj = listaAno.find(p => p.id === key);
    if (proj) {
      onSelect(proj); setPanel(null);
    }
  };

  const handleSelectProject = (proj: ProjetoMetricas) => {
    onSelect(proj); setPanel(null);
  };

  if (!computed) {
    return (
      <div className="h-full rounded-card border border-border bg-card-alt animate-pulse" aria-label="Carregando…" />
    );
  }

  const {
    balanceSummary, risk, bridge, flow,
    projectBalances,
    listaAno, listaAno26, bgVivoSum
  } = computed;

  return (
    <div className="flex flex-col gap-3 max-h-[calc(100vh-10.75rem)] overflow-hidden">
      
      {/* ── Cabeçalho com ano e filtros ───────────────────────── */}
      <div className="flex items-center justify-between shrink-0 mb-1">
        <div className="flex bg-card-alt rounded-lg p-1 border border-border shadow-sm">
          <button 
            onClick={() => setAno(2026)} 
            className={`px-4 py-1 text-xs font-semibold rounded-md transition-colors ${ano === 2026 ? "bg-info text-white shadow" : "text-text-muted hover:text-text"}`}
          >
            2026
          </button>
          <button 
            onClick={() => setAno(2027)} 
            className={`px-4 py-1 text-xs font-semibold rounded-md transition-colors ${ano === 2027 ? "bg-info text-white shadow" : "text-text-muted hover:text-text"}`}
          >
            2027 (jan–mar)
          </button>
        </div>
        
        <div className="relative">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 text-xs font-semibold text-text border border-border bg-card-alt px-3 py-1.5 rounded-md hover:border-accent transition-colors ${showFilters ? "border-accent" : ""}`}
          >
            <Filter size={14} /> Filtros ▾
            {(filtroPrograma || filtroRubrica) && (
              <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] text-white">
                {(filtroPrograma ? 1 : 0) + (filtroRubrica ? 1 : 0)}
              </span>
            )}
          </button>
          
          {showFilters && (
            <div className="absolute top-full right-0 mt-2 z-50 w-64 p-3 rounded-card border border-border bg-card shadow-lg flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-semibold text-text-muted mb-1 block">Programa</label>
                <Select value={filtroPrograma} onValueChange={setFiltroPrograma} options={programasOptions} placeholder="Todos os programas" className="w-full" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-text-muted mb-1 block flex items-center justify-between">
                  <span>Rubrica</span>
                  <span className="text-[9px] text-warn">Indisponível</span>
                </label>
                <Select value={filtroRubrica} onValueChange={setFiltroRubrica} options={[]} placeholder="Não disponível na base" className="w-full opacity-60 pointer-events-none" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Faixa KPI ─────────────────────────────────────────── */}
      {filtroRubrica && (
         <div className="text-[11px] text-warn bg-warn/10 border border-warn/20 rounded p-1.5 shrink-0">
           ⚠️ BG não filtrável por rubrica. Os valores de orçamento representam o total.
         </div>
      )}
      <div className="flex gap-2 shrink-0 max-lg:flex-wrap items-stretch">
        <KpiStat icon={<FolderKanban size={16} />} label={`BG Gov ${ano === 2027 ? "27" : "26"}`} value={fmtBRL(bgVivoSum.bgGov, true)} context="orçamento aprovado" />
        
        <KpiStat
          icon={<Wallet size={16} />}
          label={`BG Vivo ${ano === 2027 ? "27" : "26"}`}
          value={fmtBRL(bgVivoSum.bgVivo, true)}
          title={`BG Vivo = Realizado + Em pagamento + Compromisso ${ano === 2027 ? "27" : "26"} + A emitir (por projeto). Fica acima do BG Gov pelo estouro dos projetos que já passaram do próprio BG.`}
          onClick={bgVivoSum.estouro.count > 0 ? () => setPanel("estouro") : undefined}
          context={
            <span className={`block truncate ${bgVivoSum.estouro.count > 0 ? "text-info" : ""}`}>
              {bgVivoSum.diferencaVsGov >= 0 ? "+" : ""}{fmtBRL(bgVivoSum.diferencaVsGov, true)} vs BG Gov{bgVivoSum.estouro.count > 0 ? ` · estouro em ${bgVivoSum.estouro.count} projetos` : ""}
            </span>
          }
        />
        
        <KpiStat icon={<Gauge size={16} />} label="Em pagamento" value={ano === 2026 ? fmtBRL(bgVivoSum.emPagamento, true) : "—"} context={ano === 2026 ? "etapa E7" : "—"} />
        <KpiStat icon={<Wallet size={16} />} label={`Compromisso ${ano === 2027 ? "27" : "26"}`} value={fmtBRL(bgVivoSum.emitido, true)} context="emitido na carteira" />
        <KpiStat icon={<Wallet size={16} />} label="A emitir" value={fmtBRL(bgVivoSum.aEmitir, true)} context="saldo a contratar" />
        <KpiStat icon={<ShieldAlert size={16} />} label="Em risco" value={ano === 2026 ? fmtBRL(risk.totalValue, true) : "—"} tone={ano === 2026 ? "warn" : "neutral"} context={ano === 2026 ? `${risk.count} projetos` : "—"} onClick={ano === 2026 ? () => setPanel("risk") : undefined} />
      </div>

      {/* ── Layout ─────────────────────────────────────────── */}
      <div className="grid grid-cols-[1fr_minmax(300px,360px)] gap-3 items-stretch min-h-0 flex-1">
        
        {/* Coluna Esquerda: Execução em cima, Fluxo embaixo */}
        <div className="flex flex-col gap-3 min-w-0">
          <SectionCard title="Execução do Plano" action={{ label: "Ver detalhes →", onClick: () => navigate("/auditoria") }}>
            <ExecucaoPlanoCard lista={listaAno} bare ano={ano} emitidoOverride={ano === 2027 ? bgVivoSum.emitido : undefined} />
          </SectionCard>

          <div className="flex flex-col rounded-card border border-border bg-card px-5 pt-4 pb-3 flex-1 min-h-[220px]">
            <div className="flex items-center justify-between shrink-0 mb-1">
              <div className="flex items-center gap-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">Fluxo de caixa</p>
                <span className="flex items-center gap-1 text-[10px] text-text-muted font-medium">
                  <span className="w-4 h-0 border-b border-dashed border-text-muted inline-block" /> Planejado
                </span>
                <span className="flex items-center gap-1 text-[10px] text-info font-medium">
                  <span className="inline-block w-4 h-1.5 bg-info rounded-sm" /> Realizado
                </span>
              </div>
              <button type="button" className="text-[12px] text-info hover:underline" onClick={() => navigate("/auditoria")}>Ver fluxo completo →</button>
            </div>
            {ano === 2027 ? (
              <div className="flex-1 flex items-center justify-center text-[12px] text-text-muted bg-card-alt rounded border border-border/50 border-dashed m-4 p-6 text-center">
                Fluxo mensal de 2027 ainda não disponível na base (orçamento só jan–mar)
              </div>
            ) : (
              <div className="flex gap-4 items-stretch h-full">
                <div className="flex-1 min-w-0 h-full min-h-[160px]">
                  <FluxoCaixaChart
                    lista={listaAno}
                    dataBase={dataBase ?? null}
                    isLoadingCompromisso={isLoadingCompromisso}
                    compact
                    bare
                  />
                </div>
                <div className="flex flex-col justify-center gap-2 min-w-0 shrink-0 w-[150px]">
                  <div>
                    <div className="text-[10px] text-text-muted mb-0.5">Realizado acumulado</div>
                    <div className="text-[15px] font-bold tabular-nums text-text">{fmtBRL(flow.realizadoAcumulado, true)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-text-muted mb-0.5">Planejado acumulado</div>
                    <div className="text-[15px] font-bold tabular-nums text-text">{fmtBRL(flow.planejadoAcumulado, true)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-text-muted mb-0.5">Desvio</div>
                    <div className={`text-[15px] font-bold tabular-nums whitespace-nowrap ${flow.desvio < 0 ? "text-crit" : "text-ok"}`}>
                      {flow.desvio >= 0 ? "+" : ""}{fmtBRL(flow.desvio, true)}
                      <span className="block text-[11px] font-normal text-text-muted">
                        ({flow.desvioRel >= 0 ? "+" : ""}{fmtPct(flow.desvioRel)})
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Coluna Direita: Ritmo */}
        <div className="flex flex-col min-w-0 h-full relative [&>*]:flex-1">
          <AnaliseRiscoPanel 
             lista={listaAno26} 
             kpisEstrategicos={kpisEstrategicos} 
             isLoadingCompromisso={isLoadingCompromisso} 
             onSelectProject={handleSelectProject} 
          />
          {ano === 2027 && (
            <div className="absolute top-2 right-2 bg-bg px-2 py-0.5 rounded text-[10px] text-text-muted border border-border">
              Referente a 2026
            </div>
          )}
        </div>

      </div>

      {/* ── Painéis laterais ──────────────────────────────────── */}
      <RiskPanel open={panel === "risk"} onClose={() => setPanel(null)} risk={risk} />
      <EstouroPanel open={panel === "estouro"} onClose={() => setPanel(null)} estouro={bgVivoSum.estouro} />
      <BalancesPanel
        open={panel === "balances"}
        onClose={() => setPanel(null)}
        projectBalances={projectBalances}
        balanceSummary={balanceSummary}
        onSelectProject={handleSelectByKey}
      />
      <BridgePanel open={panel === "bridge"} onClose={() => setPanel(null)} bridge={bridge} />
    </div>
  );
}
