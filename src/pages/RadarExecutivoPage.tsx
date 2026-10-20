import { useState, useMemo } from "react";
import {
  FolderKanban, Wallet, ShieldAlert, Gauge, Filter, CheckCircle2
} from "lucide-react";
import type { KPIEstrategicoCarteira, ProjetoMetricas } from "../types";
import { fmtBRL, fmtPct, formatarIsoLocal } from "../lib/format";
import { aplicarFiltroRubrica } from "../lib/rubrica";
import { projetoNoRecorteComRubrica, rcNoRecorte, rubricasDoRecorte, type Recorte } from "../lib/recorte";
import { useRecorteStore } from "../store/recorteStore";
import { usePortfolioData } from "../hooks/usePortfolioData";
import { computeMetricas, withParticipacaoRisco } from "../lib/metrics";
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
import { explicarCompromissoExercicio, formatarDiaMes, fraseVirada, type ExplicacaoCompromisso } from "../features/executivo/compromissoExplicacao";
import { RC_TO_PAYMENT_DAYS } from "../features/radar/stageConfig";
import { ExecucaoPlanoCard } from "../components/ExecucaoPlanoCard";
import { RecorteAtivo } from "../components/RecorteAtivo";
import { SaldoPotencialCard } from "../features/saldo/SaldoPotencialCard";
import { FluxoCaixaChart } from "../components/FluxoCaixaChart";
import { RiskPanel } from "../features/radar/panels/RiskPanel";
import { EstouroPanel } from "../features/radar/panels/EstouroPanel";
import { BalancesPanel } from "../features/radar/panels/BalancesPanel";
import { BridgePanel } from "../features/radar/panels/BridgePanel";
import { KpiStat } from "../components/ui/pattern/KpiStat";
import { DistribuicaoFinanceiraPlataforma } from "../components/Diagnostics";
import { FlipCard } from "../components/ui/FlipCard";
import { LABELS } from "../config/labels";
import { InfoTooltip } from "../components/ui/primitives";
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

function ExplicacaoTooltipContent({
  explicacao,
  dataRef,
  notaAbertura,
}: {
  explicacao: ExplicacaoCompromisso;
  dataRef: Date;
  notaAbertura?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p>
        Classificamos cada RC pela data estimada de pagamento, a partir da etapa da esteira. Pagamento até 31/12 conta em
        2026; depois, em 2027. A decisão do gestor na Curadoria prevalece.
      </p>
      <ul className="flex flex-col gap-1 tabular-nums">
        {explicacao.linhas.map((l) => (
          <li key={l.rotulo} className="flex items-baseline justify-between gap-3">
            <span>{l.rotulo}</span>
            <span className="font-semibold">{fmtBRL(l.valor, true)}</span>
            <span className="text-text-muted whitespace-nowrap">{l.qtd === 1 ? "1 RC" : `${l.qtd} RCs`}</span>
          </li>
        ))}
      </ul>
      {notaAbertura && <p className="text-text-muted">{notaAbertura}</p>}
      <p className="text-text-faint">Estimativa de {formatarDiaMes(dataRef)}</p>
    </div>
  );
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
  const { bundle, curationMap, rcViews } = useCuration();
  const { parsed } = usePortfolioData();
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

  // Programa e plataforma são o mesmo campo (n4Curta): a tela usa o campo único `programa` do recorte
  const recorte = useMemo<Recorte>(
    () => ({ programa, rubricas, gestor, aprovador, busca }),
    [programa, rubricas, gestor, aprovador, busca]
  );
  const projetoPorNome = useMemo(() => new Map((parsed?.projetos ?? []).map((p) => [p.nome, p])), [parsed]);
  const filtrosAtivos = (programa ? 1 : 0) + (gestor ? 1 : 0) + (aprovador ? 1 : 0) + rubricas.length + (busca.trim() ? 1 : 0);

  const listaSaldo = useMemo(() => lista.filter((p) => projetoNoRecorteComRubrica(p, recorte)), [lista, recorte]);
  const saldoProjectKeys = useMemo(() => new Set(listaSaldo.map(p => p.id)), [listaSaldo]);

  const programasOptions = useMemo(() => {
    const set = new Set(lista.map(p => p.n4Curta).filter(Boolean));
    return Array.from(set).sort().map(p => ({ value: p, label: p }));
  }, [lista]);

  const rubricasOptions = useMemo(
    () => rubricasDoRecorte(parsed?.projetos ?? [], rcViews, bundle?.payments?.inPayment ?? []),
    [parsed, rcViews, bundle]
  );

  const computed = useMemo(() => {
    if (!bundle) return null;
    const dbDate = parseDateBR(dataBase) || new Date();
    const referenceDateStr = formatarIsoLocal(dbDate);

    let listaFiltradaBase = lista.filter((p) => projetoNoRecorteComRubrica(p, recorte));
    
    if (rubricas.length > 0) {
      // os campos de métrica (acumulados, status, ritmo) vêm calculados de cima: recalcula sobre os valores da rubrica
      listaFiltradaBase = withParticipacaoRisco(aplicarFiltroRubrica(listaFiltradaBase, rubricas).map((p) => computeMetricas(p, p.periodo)));
    }
    
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

    const rcsNoRecorte = new Set(
      rcViews.filter((rc) => rcNoRecorte(rc, recorte, projetoPorNome, bundle.exerciseYear)).map((rc) => rc.rc)
    );
    const allOpRows = buildOperationalRows(bundle, curationMap, referenceDateStr);
    
    const opRows = allOpRows.filter((row) => rcsNoRecorte.has(row.rc));

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
    const compromisso27 = buildBgVivo(listaAno, opRows, 2027).emitido;

    const flow = buildFlowSummary(listaAno);

    return {
      bgSistemico, totalRealizado, totalEmPagamento, prov26, provRisco, prov27,
      balanceSummary, projectBalances, risk, bridge, bottleneck,
      flow, listaAno, listaAno26, bgVivoSum, compromisso27, opRows, dbDate,
      notaVirada: fraseVirada(dbDate, bundle.exerciseYear, RC_TO_PAYMENT_DAYS),
    };
  }, [bundle, curationMap, rcViews, lista, recorte, projetoPorNome, rubricas, dataBase, ano]);

  const explicacaoCompromisso = useMemo(
    () => (computed ? explicarCompromissoExercicio(computed.opRows, ano) : null),
    [computed, ano]
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

  if (!computed || !explicacaoCompromisso) {
    return (
      <div className="h-full rounded-card border border-border bg-card-alt animate-pulse" aria-label="Carregando…" />
    );
  }

  const {
    balanceSummary, risk, bridge, flow,
    projectBalances,
    listaAno, listaAno26, bgVivoSum, compromisso27, notaVirada, dbDate
  } = computed;

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

  const emRiscoKpi = (
    <KpiStat
      icon={<ShieldAlert size={16} />}
      label="Em risco"
      value={fmtBRL(risk.totalValue, true)}
      tone="warn"
      context={
        <span className="inline-flex items-center gap-1">
          {`${risk.count} projetos`}
          <InfoTooltip label="Sobre o Em risco" text="Parte do Compromisso 26 que pode não virar caixa em 2026: RCs em etapas iniciais (E1–E3), atrasadas na E4 ou com previsão marcada como incerta na Curadoria. Clique para ver os projetos." />
        </span>
      }
      onClick={() => setPanel("risk")}
    />
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
          <>
            <KpiStat
              icon={<FolderKanban size={16} />}
              label="BG Gov 26"
              value={fmtBRL(bgVivoSum.bgGov, true)}
              context={`BG Vivo ${fmtBRL(bgVivoSum.bgVivo, true)} (${bgVivoSum.diferencaVsGov >= 0 ? "+" : ""}${fmtBRL(bgVivoSum.diferencaVsGov, true)})`}
            />
            <KpiStat icon={<CheckCircle2 size={16} />} label="Realizado 26" value={fmtBRL(bgVivoSum.realizado, true)} context="pago no exercício" />
            <KpiStat icon={<Gauge size={16} />} label="Em pagamento" value={fmtBRL(bgVivoSum.emPagamento, true)} context="etapa E7" />
            <KpiStat
              icon={<Wallet size={16} />}
              label={
                <span className="inline-flex items-center gap-1">
                  Compromisso 26
                  <InfoTooltip
                    label="Como calculamos o Compromisso 26"
                    content={<ExplicacaoTooltipContent explicacao={explicacaoCompromisso.c26} dataRef={dbDate} />}
                  />
                </span>
              }
              value={fmtBRL(bgVivoSum.emitido, true)}
              context="emitido na carteira"
            />
            <KpiStat
              icon={<Wallet size={16} />}
              label={
                <span className="inline-flex items-center gap-1">
                  Compromisso 27
                  <InfoTooltip
                    label="Como calculamos o Compromisso 27"
                    content={
                      <ExplicacaoTooltipContent
                        explicacao={explicacaoCompromisso.c27}
                        dataRef={dbDate}
                        notaAbertura={notaVirada}
                      />
                    }
                  />
                </span>
              }
              value={fmtBRL(compromisso27, true)}
              context="RCs com caixa previsto em 2027"
            />
            {import.meta.env.VITE_FEATURE_SALDO_PROJETOS === "true" ? (
              <FlipCard
                compact
                frontLabel="Em risco"
                backLabel={LABELS.saldoParadoCard}
                front={emRiscoKpi}
                back={
                  <SaldoPotencialCard
                    variant="flip"
                    projectKeys={saldoProjectKeys}
                    rubricas={rubricas}
                    anoSelecionado={ano}
                  />
                }
              />
            ) : emRiscoKpi}
          </>
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
