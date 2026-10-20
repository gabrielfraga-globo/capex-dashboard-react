import { useState, useMemo } from "react";
import { Filter, FolderKanban, Wallet, ShieldAlert, Gauge } from "lucide-react";
import type { KPIEstrategicoCarteira, ProjetoMetricas } from "../types";
import { fmtBRL, fmtPct } from "../lib/format";
import { useRecorteStore } from "../store/recorteStore";
import { navigate } from "../lib/simpleRouter";
import { useCarteiraResumo } from "../features/executivo/useCarteiraResumo";
import { KpiRow2026 } from "../features/executivo/KpiRow2026";
import { ExecucaoPlanoCard } from "../components/ExecucaoPlanoCard";
import { RecorteAtivo } from "../components/RecorteAtivo";
import { FluxoCaixaChart } from "../components/FluxoCaixaChart";
import { RiskPanel } from "../features/radar/panels/RiskPanel";
import { EstouroPanel } from "../features/radar/panels/EstouroPanel";
import { BalancesPanel } from "../features/radar/panels/BalancesPanel";
import { BridgePanel } from "../features/radar/panels/BridgePanel";
import { KpiStat } from "../components/ui/pattern/KpiStat";
import { DistribuicaoFinanceiraPlataforma } from "../components/Diagnostics";
import { FlipCard } from "../components/ui/FlipCard";
import { SectionCard } from "../components/ui/pattern/SectionCard";
import { AnaliseRiscoPanel } from "../components/AnaliseRiscoPanel";
import { Select } from "../components/ui/select";

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
  const [panel, setPanel] = useState<Panel>(null);
  
  const [ano, setAno] = useState<2026 | 2027>(2026);
  const programa = useRecorteStore((s) => s.programa);
  const rubricas = useRecorteStore((s) => s.rubricas);
  const gestor = useRecorteStore((s) => s.gestor);
  const aprovador = useRecorteStore((s) => s.aprovador);
  const busca = useRecorteStore((s) => s.busca);
  const setPrograma = useRecorteStore((s) => s.setPrograma);
  const setRubricas = useRecorteStore((s) => s.setRubricas);
  const limpar = useRecorteStore((s) => s.limpar);
  const [showFilters, setShowFilters] = useState(false);

  const filtrosAtivos = (programa ? 1 : 0) + (gestor ? 1 : 0) + (aprovador ? 1 : 0) + rubricas.length + (busca.trim() ? 1 : 0);

  const programasOptions = useMemo(() => {
    const set = new Set(lista.map(p => p.n4Curta).filter(Boolean));
    return Array.from(set).sort().map(p => ({ value: p, label: p }));
  }, [lista]);

  const { data, rubricasOptions } = useCarteiraResumo(ano, { lista, dataBase });

  const handleSelectByKey = (key: string) => {
    const proj = listaAno.find(p => p.id === key);
    if (proj) {
      onSelect(proj); setPanel(null);
    }
  };

  const handleSelectProject = (proj: ProjetoMetricas) => {
    onSelect(proj); setPanel(null);
  };

  if (!data) {
    return (
      <div className="h-full rounded-card border border-border bg-card-alt animate-pulse" aria-label="Carregando…" />
    );
  }

  const { balanceSummary, risk, bridge, flow, projectBalances, listaAno, listaAno26, bgVivoSum } = data;

  const fluxoCard = (
    <div className="flex flex-col rounded-card border border-border bg-card px-5 pt-4 pb-3 h-full min-h-[220px]">
      <div className="flex items-center justify-between shrink-0 mb-1 pr-8">
        <div className="flex items-center gap-3">
          <p data-flip-title className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">Fluxo de caixa</p>
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
        <div className="flex flex-1 min-h-0 gap-4 items-stretch">
          <div className="flex-1 min-w-0 flex flex-col min-h-[237px]">
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
  );

  return (
    <div className="flex flex-col gap-3 max-h-[calc(100vh-10.75rem)] overflow-y-auto">
      
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
            {filtrosAtivos > 0 && (
              <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] text-white">
                {filtrosAtivos}
              </span>
            )}
          </button>
          
          {showFilters && (
            <div className="absolute top-full right-0 mt-2 z-50 w-64 p-3 rounded-card border border-border bg-card shadow-lg flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-semibold text-text-muted mb-1 block">Programa</label>
                <Select value={programa} onValueChange={setPrograma} options={programasOptions} placeholder="Todos os programas" className="w-full" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-text-muted mb-1 block">Rubricas</label>
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                  {rubricasOptions.map(r => (
                    <label key={r} className="flex items-center gap-2 text-xs cursor-pointer text-text hover:bg-bg p-1 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={rubricas.includes(r)}
                        onChange={(e) => {
                          if (e.target.checked) setRubricas([...rubricas, r]);
                          else setRubricas(rubricas.filter(x => x !== r));
                        }}
                        className="rounded border-border text-accent focus:ring-accent w-3 h-3"
                      />
                      <span className="truncate">{r}</span>
                    </label>
                  ))}
                </div>
              </div>
              {filtrosAtivos > 0 && (
                <button type="button" onClick={limpar} className="self-end text-xs font-semibold text-accent hover:underline">
                  Limpar ({filtrosAtivos})
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <RecorteAtivo />

      {/* ── Faixa KPI ─────────────────────────────────────────── */}

      <div className="flex gap-2 shrink-0 max-lg:flex-wrap items-stretch">
        {ano === 2026 ? (
          <KpiRow2026 data={data} rubricas={rubricas} onAbrirRisco={() => setPanel("risk")} />
        ) : (
          <>
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
        
        <KpiStat icon={<Gauge size={16} />} label="Em pagamento" value="—" context="—" />
        <KpiStat icon={<Wallet size={16} />} label={`Compromisso ${ano === 2027 ? "27" : "26"}`} value={fmtBRL(bgVivoSum.emitido, true)} context="emitido na carteira" />
        <KpiStat icon={<Wallet size={16} />} label="A emitir" value={fmtBRL(bgVivoSum.aEmitir, true)} context="saldo a contratar" />
        <KpiStat icon={<ShieldAlert size={16} />} label="Em risco" value="—" tone="neutral" context="—" />
          </>
        )}
      </div>

      {/* ── Layout ─────────────────────────────────────────── */}
      <div className="grid grid-cols-[1fr_minmax(300px,360px)] gap-3 items-stretch min-h-0 flex-1">

        {/* Coluna esquerda: Execução do Plano em cima; Fluxo de caixa (frente) / Composição por Plataforma (verso) embaixo */}
        <div className="flex flex-col gap-3 min-w-0 min-h-0">
          <SectionCard title="Execução do Plano" action={{ label: "Ver detalhes →", onClick: () => navigate("/auditoria") }}>
            <ExecucaoPlanoCard lista={listaAno} bare ano={ano} emitidoOverride={ano === 2027 ? bgVivoSum.emitido : undefined} />
          </SectionCard>

          {ano === 2026 ? (
            <FlipCard
              compact
              className="flex-1 min-h-0 flex flex-col [&>.flip-stage]:flex-1 [&>.flip-stage]:min-h-0"
              frontLabel="Fluxo de caixa"
              backLabel="Composição por plataforma"
              front={fluxoCard}
              back={
                <div className="flex flex-col rounded-card border border-border bg-card px-5 pt-4 pb-3 h-full min-h-[220px] overflow-auto">
                  <DistribuicaoFinanceiraPlataforma lista={listaAno} />
                </div>
              }
            />
          ) : fluxoCard}
        </div>

        {/* Coluna direita: Ritmo de execução, mesma altura da coluna esquerda */}
        <div className="flex flex-col min-w-0 min-h-0 relative [&>*]:flex-1">
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
