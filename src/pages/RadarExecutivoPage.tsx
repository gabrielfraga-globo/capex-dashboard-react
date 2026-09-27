/**
 * Visão Executiva — Fase 5b'.
 * Sem rolagem em >= 1280×800. Container h-[calc(100vh-10.75rem)] overflow-hidden.
 */
import { useState, useMemo } from "react";
import {
  FolderKanban, Wallet, AlertTriangle, ShieldAlert, ArrowLeftRight,
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
      composition, flow, nNoRitmo, nAcompanhar, nRequerAcao, ritmoRows,
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
    bgSistemico, balanceSummary, risk, bridge, composition, flow,
    nNoRitmo, nAcompanhar, nRequerAcao, ritmoRows, projectBalances,
  } = computed;

  const nTotal = nNoRitmo + nAcompanhar + nRequerAcao;
  const M = (v: number) => (v / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const maxCount = Math.max(...ritmoRows.map((r) => r.count), 1);

  // ── Faixa KPI ──────────────────────────────────────────────────────
  const kpiItems = [
    {
      icon: <FolderKanban size={18} className="text-text-muted" />,
      value: nTotal.toString(),
      label: "projetos com orçamento 2026",
      onClick: undefined as (() => void) | undefined,
    },
    {
      icon: <Wallet size={18} className="text-text-muted" />,
      value: `R$ ${M(bgSistemico)}M`,
      label: "orçamento total",
      onClick: undefined as (() => void) | undefined,
    },
    {
      icon: <AlertTriangle size={18} className="text-crit" />,
      value: nRequerAcao.toString(),
      label: "requer ação (ritmo)",
      valueClass: "text-crit",
      onClick: undefined as (() => void) | undefined,
    },
    {
      icon: <ShieldAlert size={18} className="text-warn" />,
      value: `R$ ${M(risk.totalValue)}M`,
      label: "em risco de caixa",
      valueClass: "text-warn",
      onClick: () => setPanel("risk"),
    },
    {
      icon: <ArrowLeftRight size={18} className="text-text-muted" />,
      value: `R$ ${M(balanceSummary.parado.value)}M`,
      label: "saldo remanejável",
      onClick: () => setPanel("balances"),
    },
  ] as const;

  return (
    <div
      className="flex flex-col gap-2.5 h-[calc(100vh-10.75rem)] overflow-hidden max-lg:h-auto max-lg:overflow-visible"
      style={{ minHeight: 0 }}
    >
      {/* ── Faixa KPI ─────────────────────────────────────────── */}
      <div className="flex gap-2 shrink-0 max-lg:flex-wrap">
        {kpiItems.map((k) => (
          <button
            key={k.label}
            type="button"
            onClick={k.onClick}
            disabled={!k.onClick}
            className={`flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2.5 rounded-card border border-border bg-card text-left transition-colors ${k.onClick ? "hover:border-accent/60 cursor-pointer" : "cursor-default"}`}
          >
            <span className="shrink-0">{k.icon}</span>
            <div className="min-w-0">
              <div className={`text-[20px] font-bold tabular-nums leading-tight text-text ${"valueClass" in k ? k.valueClass : ""}`}>
                {k.value}
              </div>
              <div className="text-[11px] text-text-muted leading-snug truncate">{k.label}</div>
            </div>
          </button>
        ))}
      </div>

      {/* ── Grade 2×2 ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5 flex-1 min-h-0 max-lg:grid-cols-1 max-lg:h-auto">

        {/* 1. Execução do Plano */}
        <div className="flex flex-col rounded-card border border-border bg-card px-4 pt-3 pb-2 min-h-0">
          <div className="flex items-center justify-between shrink-0 mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Execução do Plano</p>
            <button
              type="button"
              className="text-[12px] text-info hover:underline"
              onClick={() => navigate("/auditoria")}
            >
              Ver detalhes →
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col justify-center">
            <ExecucaoPlanoCard lista={lista} bare />
          </div>
        </div>

        {/* 2. Ritmo dos projetos */}
        <div className="flex flex-col rounded-card border border-border bg-card px-4 pt-3 pb-2 min-h-0">
          <div className="flex items-center justify-between shrink-0 mb-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Ritmo dos projetos</p>
            <button
              type="button"
              className="text-[12px] text-info hover:underline"
              onClick={() => navigate("/auditoria")}
            >
              Ver Auditoria →
            </button>
          </div>
          {/* 4 cols: rótulo fixo · barra flex · contagem · R$ */}
          <div className="flex flex-col justify-around flex-1 min-h-0">
            {ritmoRows.map((r) => (
              <div
                key={r.label}
                className="grid items-center gap-x-3 text-[13px]"
                style={{ gridTemplateColumns: "110px 1fr auto auto" }}
              >
                <span className="text-text-muted">{r.label}</span>
                <div className="relative h-2 rounded bg-border overflow-hidden">
                  <div
                    className={`absolute inset-y-0 left-0 rounded ${r.color}`}
                    style={{ width: `${Math.round((r.count / maxCount) * 100)}%` }}
                  />
                </div>
                <span className="font-semibold tabular-nums text-text text-right">{r.count}</span>
                <span className="text-text-muted tabular-nums text-right text-[12px]">{fmtBRL(r.valor, true)}</span>
              </div>
            ))}
            <div className="pt-1.5 border-t border-border flex justify-between text-[12px] font-semibold text-text">
              <span>Total</span>
              <span>{nTotal} projetos</span>
            </div>
          </div>
        </div>

        {/* 3. Composição por plataforma */}
        <div className="flex flex-col rounded-card border border-border bg-card px-4 pt-3 pb-2 min-h-0">
          <div className="flex items-center justify-between shrink-0 mb-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Composição por plataforma</p>
            <button
              type="button"
              className="text-[12px] text-info hover:underline"
              onClick={() => navigate("/auditoria")}
            >
              Ver todas →
            </button>
          </div>
          {/* 4 cols: nome · barra flex · R$ · % */}
          <div className="flex flex-col justify-around flex-1 min-h-0">
            {composition.rows.map((r) => (
              <div
                key={r.label}
                className="grid items-center gap-x-3 text-[13px]"
                style={{ gridTemplateColumns: "minmax(0, 210px) 1fr 76px 48px" }}
              >
                <span
                  className={`truncate ${r.isOther ? "text-text-faint" : "text-text-muted"}`}
                  title={r.label}
                >
                  {r.label}
                </span>
                <div className="relative h-2 rounded bg-border overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded bg-text-muted"
                    style={{ width: `${Math.round(r.pct * 100)}%`, opacity: r.isOther ? 0.3 : 0.65 }}
                  />
                </div>
                <span className="tabular-nums text-text text-right text-[12px]">{fmtBRL(r.value, true)}</span>
                <span className="tabular-nums text-text-muted text-right text-[12px]">{fmtPct(r.pct)}</span>
              </div>
            ))}
            <div className="pt-1.5 border-t border-border grid gap-x-3 text-[12px] font-semibold text-text" style={{ gridTemplateColumns: "minmax(0, 210px) 1fr 76px 48px" }}>
              <span>Total</span>
              <span />
              <span className="text-right">{fmtBRL(composition.total, true)}</span>
              <span className="text-right text-text-muted">100%</span>
            </div>
          </div>
        </div>

        {/* 4. Fluxo de caixa */}
        <div className="flex flex-col rounded-card border border-border bg-card px-4 pt-3 pb-2 min-h-0">
          {/* Cabeçalho com legenda Plan/Real */}
          <div className="flex items-center justify-between shrink-0 mb-1">
            <div className="flex items-center gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Fluxo de caixa</p>
              <span className="flex items-center gap-1 text-[10px] text-text-muted font-medium">
                <span className="w-4 h-0 border-b border-dashed border-text-muted inline-block" /> Plan
              </span>
              <span className="flex items-center gap-1 text-[10px] text-info font-medium">
                <span className="inline-block w-4 h-1.5 bg-info rounded-sm" /> Real
              </span>
            </div>
            <button
              type="button"
              className="text-[12px] text-info hover:underline"
              onClick={() => setPanel("bridge")}
            >
              Do BG ao projetado →
            </button>
          </div>
          {/* Corpo: gráfico (flex-1) + 3 números (fixo) */}
          <div className="flex flex-1 min-h-0 gap-3">
            <div className="flex-[2] min-h-0">
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
