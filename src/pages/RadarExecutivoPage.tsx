import { useState } from "react";
import { FolderKanban, Wallet, ShieldAlert, Gauge } from "lucide-react";
import type { KPIEstrategicoCarteira, ProjetoMetricas } from "../types";
import { fmtBRL } from "../lib/format";
import { useRecorteStore } from "../store/recorteStore";
import { navigate } from "../lib/simpleRouter";
import { useCarteiraResumo } from "../features/executivo/useCarteiraResumo";
import { KpiRow2026 } from "../features/executivo/KpiRow2026";
import { ExecucaoPlanoCard } from "../components/ExecucaoPlanoCard";
import { RecorteAtivo } from "../components/RecorteAtivo";
import { FluxoCaixaCard } from "../features/executivo/FluxoCaixaCard";
import { RiskPanel } from "../features/radar/panels/RiskPanel";
import { EstouroPanel } from "../features/radar/panels/EstouroPanel";
import { BalancesPanel } from "../features/radar/panels/BalancesPanel";
import { BridgePanel } from "../features/radar/panels/BridgePanel";
import { KpiStat } from "../components/ui/pattern/KpiStat";
import { SectionCard } from "../components/ui/pattern/SectionCard";
import { AnaliseRiscoPanel } from "../components/AnaliseRiscoPanel";
import { FiltrosRecorte } from "../features/executivo/FiltrosRecorte";

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
  const rubricas = useRecorteStore((s) => s.rubricas);

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
        
        <FiltrosRecorte lista={lista} rubricasOptions={rubricasOptions} />
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

          <FluxoCaixaCard
            ano={ano}
            lista={listaAno}
            flow={flow}
            dataBase={dataBase}
            isLoadingCompromisso={isLoadingCompromisso}
          />
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
