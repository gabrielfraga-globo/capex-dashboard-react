/**
 * Visão Executiva — Fase 5b'.
 * Sem rolagem em >= 1280×800. Container h-[calc(100vh-10.75rem)] overflow-hidden.
 */
import { useState, useMemo } from "react";
import {
  FolderKanban, Wallet, AlertTriangle, ShieldAlert, Gauge
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
  buildPlatformComposition,
  buildFlowSummary,
} from "../features/radar/executive";
import { buildOperationalRows } from "../features/radar/operational";
import { normalizeKey } from "../lib/csvProcessingCore";
import { ExecucaoPlanoCard } from "../components/ExecucaoPlanoCard";
import { FluxoCaixaChart } from "../components/FluxoCaixaChart";
import { RiskPanel } from "../features/radar/panels/RiskPanel";
import { BalancesPanel } from "../features/radar/panels/BalancesPanel";
import { BridgePanel } from "../features/radar/panels/BridgePanel";
import { KpiStat } from "../components/ui/pattern/KpiStat";
import { SectionCard } from "../components/ui/pattern/SectionCard";
import { BarList } from "../components/ui/pattern/BarList";
import { buildProgramProgress } from "../features/radar/executive";

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

type Panel = "risk" | "balances" | "bridge" | null;

export function RadarExecutivoPage({
  lista,
  onSelect,
  isLoadingCompromisso,
  dataBase,
}: Props) {
  const { bundle, curationMap } = useCuration();
  const [panel, setPanel] = useState<Panel>(null);

  const computed = useMemo(() => {
    if (!bundle) return null;
    const dbDate = parseDateBR(dataBase) || new Date();
    const referenceDateStr = dbDate.toISOString().slice(0, 10);

    const validKeys = new Set(lista.map((p) => `${normalizeKey(p.n4)}|${normalizeKey(p.nome)}`));
    const allOpRows = buildOperationalRows(bundle, curationMap, referenceDateStr);
    const opRows = allOpRows.filter((row) => {
      const commitments = bundle.commitments.filter((c: any) => c.rc === row.rc);
      return commitments.some((c: any) => validKeys.has(`${normalizeKey(c.n4)}|${normalizeKey(c.projectName)}`));
    });

    const projectBalances = buildProjectBalances(lista, bundle.projectActivity, dbDate);
    const balanceSummary = summarizeBalances(projectBalances);
    const risk = buildProjectsAtRisk(opRows);
    const consistency = buildCurationConsistency(opRows, dbDate, bundle.exerciseYear);
    const { prov26, provRisco, prov27 } = sumProvisioned(opRows);

    let totalRealizado = 0, totalEmPagamento = 0, bgSistemico = 0;
    for (const p of lista) {
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
    const composition = buildPlatformComposition(lista, 4);
    const flow = buildFlowSummary(lista);

    const nNoRitmo = lista.filter((p) => p.status === "Normal").length;
    const nAcompanhar = lista.filter((p) => p.status === "Revisar Caixa Ano").length;
    const nRequerAcao = lista.filter((p) => p.status === "Estouro" || p.status === "Risco de Não Realização").length;

    const programProgress = buildProgramProgress(lista, opRows);
    const top3RequerAcao = lista
      .filter((p) => p.status === "Estouro" || p.status === "Risco de Não Realização")
      .sort((a, b) => (b.orcamentoPeriodo ?? 0) - (a.orcamentoPeriodo ?? 0))
      .slice(0, 3);
      
    // KPI Execução (mesma conta do ExecucaoPlanoCard)
    const orcamentoTotalBreakdown = lista.reduce((a, p) => a + (p.orcamentoPeriodo ?? 0), 0);
    const emitidoBreakdown = lista.reduce((a, p) => a + (p.compromisso ?? 0), 0);
    const pctExecucao = orcamentoTotalBreakdown > 0 ? (totalRealizado + totalEmPagamento + emitidoBreakdown) / orcamentoTotalBreakdown : 0;
    
    // KPI Cobertura do BG
    const projetado = totalRealizado + totalEmPagamento + prov26;
    const pctCoberturaBg = bgSistemico > 0 ? projetado / bgSistemico : 0;

    // Values for Ritmo rows
    const ritmoRows = [
      {
        label: "No ritmo", count: nNoRitmo,
        valor: lista.filter((p) => p.status === "Normal").reduce((a, p) => a + (p.orcamentoPeriodo ?? 0), 0),
        color: "bg-ok",
      },
      {
        label: "Acompanhar", count: nAcompanhar,
        valor: lista.filter((p) => p.status === "Revisar Caixa Ano").reduce((a, p) => a + (p.orcamentoPeriodo ?? 0), 0),
        color: "bg-warn",
      },
      {
        label: "Requer ação", count: nRequerAcao,
        valor: lista.filter((p) => p.status === "Estouro" || p.status === "Risco de Não Realização").reduce((a, p) => a + (p.orcamentoPeriodo ?? 0), 0),
        color: "bg-crit",
      },
    ];

    return {
      bgSistemico, totalRealizado, totalEmPagamento, prov26, provRisco, prov27,
      balanceSummary, projectBalances, risk, bridge, bottleneck,
      composition, flow, nNoRitmo, nAcompanhar, nRequerAcao, ritmoRows, programProgress, top3RequerAcao, pctExecucao, pctCoberturaBg, projetado
    };
  }, [bundle, curationMap, lista, dataBase]);

  const handleSelectByKey = (key: string) => {
    const proj = lista.find((p) => p.id === key);
    if (proj) { onSelect(proj); setPanel(null); }
  };

  if (!computed) {
    return (
      <div className="h-full rounded-card border border-border bg-card-alt animate-pulse" aria-label="Carregando…" />
    );
  }

  const {
    bgSistemico, balanceSummary, risk, bridge, flow,
    nNoRitmo, nAcompanhar, nRequerAcao, ritmoRows, projectBalances,
    programProgress, top3RequerAcao, pctExecucao, pctCoberturaBg, projetado
  } = computed;

  const nTotal = nNoRitmo + nAcompanhar + nRequerAcao;
  // ── Faixa KPI ──────────────────────────────────────────────────────


  return (
    <div
      className="flex flex-col gap-3"
    >
      {/* ── Faixa KPI ─────────────────────────────────────────── */}
      <div className="flex gap-2 shrink-0 max-lg:flex-wrap items-stretch">
        <KpiStat icon={<FolderKanban size={16} />} label="Projetos" value={nTotal.toString()} context="com orçamento 2026" />
        <KpiStat icon={<Gauge size={16} />} label="Execução do plano" value={fmtPct(pctExecucao)} context="vs plano provisionado" />
        <KpiStat icon={<AlertTriangle size={16} />} label="Ritmo dos projetos" value={nRequerAcao.toString()} tone="crit" context="requerem ação" />
        <KpiStat icon={<ShieldAlert size={16} />} label="Em risco" value={fmtBRL(risk.totalValue, true)} tone="warn" context={`${risk.count} projetos`} onClick={() => setPanel("risk")} />
        <KpiStat icon={<Wallet size={16} />} label="Cobertura do BG" value={fmtPct(pctCoberturaBg)} context={`${fmtBRL(projetado, true)} de ${fmtBRL(bgSistemico, true)}`} tone="info" onClick={() => setPanel("bridge")} />
      </div>

      {/* ── Grade 2×2 ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 items-stretch max-lg:grid-cols-1">

        {/* 1. Execução do Plano */}
        <SectionCard title="Execução do Plano" action={{ label: "Ver detalhes →", onClick: () => navigate("/auditoria") }}>
          <ExecucaoPlanoCard lista={lista} bare />
        </SectionCard>

        {/* 2. Ritmo dos projetos */}
        <SectionCard title="Ritmo dos projetos" action={{ label: "Ver Auditoria →", onClick: () => navigate("/auditoria") }}>
          <BarList 
            rows={ritmoRows.map(r => ({ label: r.label, dot: true, count: r.count, value: r.valor, pct: nTotal ? r.count / nTotal : 0, color: r.color }))}
            totalLabel="Total"
            totalCount={nTotal}
          />
          <div className="mt-4 flex flex-col">
            <div className="flex justify-between items-end mb-2">
              <p className="text-[11px] font-semibold text-text-muted">Principais projetos que requerem ação</p>
              <span className="text-[10px] uppercase font-semibold text-text-muted">Orçamento</span>
            </div>
            <div className="flex flex-col gap-1.5 mb-3">
              {top3RequerAcao.map((p, i) => (
                <div key={p.id} className="grid items-center gap-x-3 text-[13px]" style={{ gridTemplateColumns: "16px minmax(0,1fr) 140px 72px" }}>
                   <span className="text-text-faint tabular-nums">{i + 1}</span>
                   <span className="truncate text-text" title={p.nome}>{p.nome}</span>
                   <span className="relative h-[6px] rounded bg-border overflow-hidden"><span className="absolute inset-y-0 left-0 rounded bg-crit" style={{ width: `${Math.round(((p.orcamentoPeriodo ?? 0) / Math.max(1, top3RequerAcao[0]?.orcamentoPeriodo ?? 1)) * 100)}%` }} /></span>
                   <span className="tabular-nums text-text text-right">{fmtBRL(p.orcamentoPeriodo ?? 0, true)}</span>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-border flex justify-between items-center text-[12px]">
               <span className="text-text-muted">Saldo remanejável <span className="font-semibold text-text ml-1">{fmtBRL(balanceSummary.parado.value, true)}</span></span>
               <button type="button" onClick={() => setPanel("balances")} className="text-info hover:underline font-semibold">Ver painel de saldos →</button>
            </div>
          </div>
        </SectionCard>

        {/* 3. Progresso por programa */}
        <SectionCard title="Progresso por programa" action={{ label: "Ver todas →", onClick: () => navigate("/auditoria") }}>
          <div className="flex flex-col">
            <div className="grid gap-x-3 text-[11px] uppercase tracking-wide text-text-muted font-semibold pb-2 whitespace-nowrap" style={{ gridTemplateColumns: "200px 1fr 84px 84px" }}>
              <span>Programa</span>
              <span>Progresso</span>
              <span className="text-right">Orçamento</span>
              <span className="text-right">Risco</span>
            </div>
            <div className="flex flex-col gap-3">
              {programProgress.rows.map((r, idx) => (
                <div key={r.label} className="grid items-center gap-x-3 text-[13px] whitespace-nowrap" style={{ gridTemplateColumns: "200px 1fr 84px 84px" }}>
                  <span className="truncate text-text-muted" title={r.label}>{r.label}</span>
                  <div className="flex items-center gap-2">
                    <div className="relative h-[6px] flex-1 rounded bg-border overflow-hidden">
                      <div className={`absolute inset-y-0 left-0 rounded ${["bg-info", "bg-ok", "bg-violet-500", "bg-warn", "bg-slate-500"][idx % 5]}`} style={{ width: `${Math.min(100, Math.round(r.pct * 100))}%` }} />
                    </div>
                    <span className="tabular-nums text-[12px] w-[3ch]">{Math.round(r.pct * 100)}%</span>
                  </div>
                  <span className="tabular-nums text-text text-right text-[12px]">{fmtBRL(r.orcamento, true)}</span>
                  <span className={`tabular-nums text-right text-[12px] ${r.risco > 0 ? "text-warn" : "text-text-muted"}`}>{r.risco > 0 ? fmtBRL(r.risco, true) : "—"}</span>
                </div>
              ))}
            </div>
            <div className="pt-2 mt-2 border-t border-border grid gap-x-3 text-[12px] font-semibold text-text whitespace-nowrap" style={{ gridTemplateColumns: "200px 1fr 84px 84px" }}>
              <span>Total</span>
              <div className="flex items-center gap-2">
                <div className="relative h-[6px] flex-1 rounded bg-border overflow-hidden">
                  <div className="absolute inset-y-0 left-0 rounded bg-info" style={{ width: `${Math.round(programProgress.total.pct * 100)}%` }} />
                </div>
                <span className="tabular-nums text-[12px] w-[3ch]">{Math.round(programProgress.total.pct * 100)}%</span>
              </div>
              <span className="text-right">{fmtBRL(programProgress.total.orcamento, true)}</span>
              <span className={`text-right ${programProgress.total.risco > 0 ? "text-warn" : "text-text-muted"}`}>{programProgress.total.risco > 0 ? fmtBRL(programProgress.total.risco, true) : "—"}</span>
            </div>
          </div>
        </SectionCard>

        {/* 4. Fluxo de caixa */}
        <div className="flex flex-col rounded-card border border-border bg-card px-5 pt-4 pb-3">
          {/* Cabeçalho com legenda Plan/Real */}
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
            <button
              type="button"
              className="text-[12px] text-info hover:underline"
              onClick={() => navigate("/auditoria")}
            >
              Ver fluxo completo →
            </button>
          </div>
          {/* Corpo: gráfico (flex-1) + 3 números (fixo) */}
          <div className="flex gap-4 items-stretch">
            <div className="flex-1 min-w-0 h-[205px]">
              <FluxoCaixaChart
                lista={lista}
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
        </div>
      </div>

      {/* ── Painéis laterais ──────────────────────────────────── */}
      <RiskPanel open={panel === "risk"} onClose={() => setPanel(null)} risk={risk} />
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
