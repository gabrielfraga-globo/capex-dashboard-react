import { useMemo, useState } from "react";
import { FolderKanban, Wallet, ShieldAlert, Gauge, CheckCircle2 } from "lucide-react";
import type { KPIEstrategicoCarteira, ProjetoMetricas } from "../types";
import { fmtMilhoes } from "../lib/format";
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
import { ExecucaoTorres } from "../features/executivo/ExecucaoTorres";
import { useMetricas } from "../domain/useMetricas";
import { InfoTooltip } from "../components/ui/primitives";
import { LABELS } from "../config/labels";

interface Props {
  lista: ProjetoMetricas[];
  kpisEstrategicos: KPIEstrategicoCarteira[];
  onSelect: (p: ProjetoMetricas) => void;
  isLoadingCompromisso?: boolean;
  dataBase?: string | null;
}

type Panel = "risk" | "balances" | "bridge" | "estouro" | null;
type Premissa = "diretoria" | "completa";

const PREMISSA_STORAGE_KEY = "capex.tatica.premissa";

function lerPremissa(): Premissa {
  try {
    return sessionStorage.getItem(PREMISSA_STORAGE_KEY) === "diretoria" ? "diretoria" : "completa";
  } catch {
    return "completa";
  }
}

function gravarPremissa(premissa: Premissa) {
  try {
    sessionStorage.setItem(PREMISSA_STORAGE_KEY, premissa);
  } catch {
    // sessionStorage indisponível: a escolha vale só nesta montagem.
  }
}

export function RadarExecutivoPage({
  lista,
  kpisEstrategicos,
  onSelect,
  isLoadingCompromisso,
  dataBase,
}: Props) {
  const [panel, setPanel] = useState<Panel>(null);
  
  const [ano, setAno] = useState<2026 | 2027>(2026);
  const [premissa, setPremissa] = useState<Premissa>(lerPremissa);
  const [mostrar2027, setMostrar2027] = useState(false);
  const rubricas = useRecorteStore((s) => s.rubricas);

  const { data, rubricasOptions } = useCarteiraResumo(ano, { lista, dataBase });
  const metricas = useMetricas({ lista, dataBase });

  const modoDiretoria = ano === 2026 && premissa === "diretoria";

  const trocarPremissa = (nova: Premissa) => {
    setPremissa(nova);
    gravarPremissa(nova);
  };

  const bg27 = useMemo(
    () => (metricas ? metricas.projetos.reduce((soma, p) => soma + (p.orcamento2027 ?? 0), 0) : 0),
    [metricas],
  );

  const projetosAcima = useMemo(
    () => (metricas ? metricas.simples.projetos.filter((p) => p.excesso > 0).length : 0),
    [metricas],
  );

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

  // Universo do Ritmo = projetos ativos em 2026 (o mesmo da Aderência); sem métricas, mantém a lista inteira.
  const idsAtivos = metricas ? new Set(metricas.projetosAtivos.map((p) => p.id)) : null;
  const listaRitmo = idsAtivos ? listaAno26.filter((p) => idsAtivos.has(p.id)) : listaAno26;

  return (
    <div className="flex flex-col gap-2 h-[calc(100vh-10.5rem)] min-h-[600px]">
      
      {/* ── Cabeçalho com ano e filtros ───────────────────────── */}
      <div className="flex items-center justify-between shrink-0 mb-1">
        <div className="flex items-center gap-2">
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
        {ano === 2026 && (
          <div role="group" aria-label="Premissa de visão" className="flex bg-card-alt rounded-lg p-1 border border-border shadow-sm">
            {(["diretoria", "completa"] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={premissa === p}
                onClick={() => trocarPremissa(p)}
                className={`px-4 py-1 text-xs font-semibold rounded-md transition-colors ${premissa === p ? "bg-info text-white shadow" : "text-text-muted hover:text-text"}`}
              >
                {p === "diretoria" ? "Visão diretoria" : "Visão completa"}
              </button>
            ))}
          </div>
        )}
        </div>
        
        <FiltrosRecorte lista={lista} rubricasOptions={rubricasOptions} />
      </div>

      <RecorteAtivo />

      {/* ── Faixa KPI ─────────────────────────────────────────── */}

      <div className="flex gap-2 shrink-0 max-lg:flex-wrap items-stretch">
        {modoDiretoria ? (
          metricas ? (
            <>
              <KpiStat
                icon={<FolderKanban size={16} />}
                label="BG Gov 26"
                value={fmtMilhoes(metricas.simples.total.bg)}
                context={`${LABELS.bgVivoSimulado} ${fmtMilhoes(metricas.simples.total.provisionado + metricas.simples.total.excesso)} (provisionado + excesso)`}
              />
              <KpiStat icon={<CheckCircle2 size={16} />} label="Realizado 26" value={fmtMilhoes(metricas.simples.total.pago)} context="pago no exercício" />
              <KpiStat icon={<Gauge size={16} />} label="Em pagamento" value={fmtMilhoes(metricas.simples.total.emPagamento)} context="etapa E7" />
              <KpiStat
                icon={<Wallet size={16} />}
                label="Comprometido 26"
                value={fmtMilhoes(metricas.simples.total.comprometido)}
                context={`inclui ${fmtMilhoes(metricas.simples.total.emRiscoSinal)} em risco · ${fmtMilhoes(metricas.simples.total.excesso)} acima do orç.`}
              />
              <KpiStat icon={<Wallet size={16} />} label="Declarado 27" value={fmtMilhoes(metricas.simples.total.declarado27)} context="informado pelos times" />
              <KpiStat
                icon={<ShieldAlert size={16} />}
                label={
                  <span className="inline-flex items-center gap-1">
                    Em risco
                    <InfoTooltip
                      label="Sobre o Em risco"
                      text="Emitido ainda sem pedido, limitado ao orçamento de cada projeto. O painel lista todas as RCs nessa situação."
                    />
                  </span>
                }
                value={fmtMilhoes(metricas.simples.total.emRiscoSinal)}
                tone="warn"
                context="sinal: emitido ainda sem pedido"
                onClick={() => setPanel("risk")}
              />
            </>
          ) : (
            <div className="h-20 flex-1 rounded-card border border-border bg-card-alt animate-pulse" aria-label="Carregando…" />
          )
        ) : ano === 2026 ? (
          <KpiRow2026 data={data} rubricas={rubricas} onAbrirRisco={() => setPanel("risk")} />
        ) : (
          <>
        <KpiStat icon={<FolderKanban size={16} />} label={`BG Gov ${ano === 2027 ? "27" : "26"}`} value={fmtMilhoes(bgVivoSum.bgGov)} context="orçamento aprovado" />
        
        <KpiStat
          icon={<Wallet size={16} />}
          label={`${LABELS.fechamentoEstimado} ${ano === 2027 ? "27" : "26"}`}
          value={fmtMilhoes(bgVivoSum.bgVivo)}
          title={`${LABELS.fechamentoEstimado} = Realizado + Em pagamento + Compromisso ${ano === 2027 ? "27" : "26"} + A emitir (por projeto). Fica acima do BG Gov pelo estouro dos projetos que já passaram do próprio BG.`}
          onClick={bgVivoSum.estouro.count > 0 ? () => setPanel("estouro") : undefined}
          context={
            <span className={`block truncate ${bgVivoSum.estouro.count > 0 ? "text-info" : ""}`}>
              {bgVivoSum.diferencaVsGov >= 0 ? "+" : ""}{fmtMilhoes(bgVivoSum.diferencaVsGov)} vs BG Gov{bgVivoSum.estouro.count > 0 ? ` · acima do BG Gov em ${bgVivoSum.estouro.count} projetos` : ""}
            </span>
          }
        />
        
        <KpiStat icon={<Gauge size={16} />} label="Em pagamento" value="—" context="—" />
        <KpiStat icon={<Wallet size={16} />} label={`Compromisso ${ano === 2027 ? "27" : "26"}`}         value={fmtMilhoes(bgVivoSum.emitido)} context="emitido na carteira" />
                <KpiStat icon={<Wallet size={16} />} label="A emitir" value={fmtMilhoes(bgVivoSum.aEmitir)} context="saldo a contratar" />
        <KpiStat icon={<ShieldAlert size={16} />} label="Em risco" value="—" tone="neutral" context="—" />
          </>
        )}
      </div>

      {/* ── Layout ─────────────────────────────────────────── */}
      <div className="grid grid-cols-[1fr_minmax(300px,360px)] gap-3 items-stretch min-h-0 flex-1">

        {/* Coluna esquerda: Execução do Plano em cima; Fluxo de caixa (frente) / Composição por Plataforma (verso) embaixo */}
        <div className="flex flex-col gap-3 min-w-0 min-h-0">
          {modoDiretoria ? (
            <div className="flex min-h-0 flex-1 flex-col">
              {metricas ? (
                <ExecucaoTorres
                  total={metricas.simples.total}
                  bg27={bg27}
                  projetosAcima={projetosAcima}
                  mostrar2027={mostrar2027}
                  onToggle2027={() => setMostrar2027((v) => !v)}
                  onOpenRisco={() => setPanel("risk")}
                />
              ) : (
                <div className="min-h-0 flex-1 rounded-card border border-border bg-card-alt animate-pulse" aria-label="Carregando…" />
              )}
            </div>
          ) : (
            <SectionCard title="Execução do Plano" action={{ label: "Ver detalhes →", onClick: () => navigate("/auditoria") }}>
              <ExecucaoPlanoCard lista={listaAno} bare ano={ano} emitidoOverride={ano === 2027 ? bgVivoSum.emitido : undefined} />
            </SectionCard>
          )}

          <FluxoCaixaCard
            ano={ano}
            preencherAltura
            lista={listaAno}
            flow={flow}
            dataBase={dataBase}
            isLoadingCompromisso={isLoadingCompromisso}
          />
        </div>

        {/* Coluna direita: Ritmo de execução, mesma altura da coluna esquerda */}
        <div className="flex flex-col min-w-0 min-h-0 relative [&>*]:flex-1">
          <AnaliseRiscoPanel 
             lista={listaRitmo} 
             mostrarSemOrcamento={metricas !== null}
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
