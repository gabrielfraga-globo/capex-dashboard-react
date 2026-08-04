import { useMemo, useState } from "react";
import { ComposedChart, Area, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { SkeletonBlock } from "./ui/SkeletonCard";
import type { KPIEstrategicoCarteira, ProjetoMetricas } from "../types";
import { useFilterStore } from "../store/filterStore";
import { generateRiskSummary } from "../lib/insights";
import { fmtPct, formatCurrencyMillions } from "../lib/format";
import { usePctExecucaoPlano, useAEmitirAno } from "../hooks/usePortfolioMetrics";
import { ProjectListModal } from "./ProjectListModal";

import { Search, SlidersHorizontal, ChevronRight, CheckCircle2, AlertTriangle } from "lucide-react";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
// Trava M-1: barras do gráfico só são coloridas até o mês fechado anterior.
const _mesRealRadar = new Date().getMonth() + 1;
const MES_ATUAL = _mesRealRadar === 1 ? 12 : _mesRealRadar - 1;

const SAUDE_STYLE: Record<string, string> = {
  "Dentro do Plano": "bg-risk-baixo/10 border-risk-baixo/30 text-risk-baixo",
  "Acompanhar": "bg-risk-medio/10 border-risk-medio/30 text-amber-600",
  "Requer Ação": "bg-risk-alto/10 border-risk-alto/30 text-risk-alto",
};

/** Paleta semântica para segmentos de composição do Gráfico A.
 *  Emitido = comprometido mas não pago → neutro/informacional, nunca vermelho. */
const BREAKDOWN_COLORS: Record<string, { bg: string; text: string; colorHex: string }> = {
  realizado:   { bg: "bg-emerald-500", text: "text-emerald-900", colorHex: "#10b981" },
  emPagamento: { bg: "bg-amber-500",   text: "text-amber-900",   colorHex: "#f59e0b" },
  emitido:     { bg: "bg-indigo-400",  text: "text-indigo-900",  colorHex: "#818cf8" },
  naoEmitido:  { bg: "bg-slate-500",   text: "text-slate-900",   colorHex: "#64748b" },
};

/** Banda de aderência ao plano por mês — usada para colorir a barra de Executado. */
function bandaDelta(pctAbs: number): { cor: string; label: string } {
  if (pctAbs <= 0.05) return { cor: "#2A9D6F", label: "Dentro do Plano" };
  if (pctAbs <= 0.15) return { cor: "#E0B429", label: "Acompanhar" };
  return { cor: "#C0392B", label: "Requer Ação" };
}

type Foco = "todos" | "dentro" | "acompanhar" | "acao" | "faltantes" | "excedentes";

type FluxoEntry = {
  mes: string;
  Planejado: number;
  Realizado: number | null;
  planejadoAcumulado: number;
  realizadoAcumulado: number | null;
  baseGapPositivo: number | null;
  gapPositivo: number | null;
  baseGapNegativo: number | null;
  gapNegativo: number | null;
  pct: number | null;
  banda: { cor: string; label: string } | null;
};

function CustomTooltipFluxo({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: FluxoEntry }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-white/95 p-3 shadow-lg text-xs min-w-[200px] dark:bg-zinc-900/95">
      <p className="mb-2 font-bold text-text">{label}</p>
      <p className="text-[10px] uppercase tracking-wide text-text-muted">Acumulado até o mês</p>
      <p className="font-semibold text-violet-300">Planejado: {formatCurrencyMillions(d.planejadoAcumulado)}</p>
      {d.realizadoAcumulado !== null && (
        <p className="font-semibold" style={{ color: d.banda?.cor ?? '#8B7FE8' }}>
          Realizado: {formatCurrencyMillions(d.realizadoAcumulado)}
        </p>
      )}
      <hr className="my-1.5 border-border-subtle" />
      <p className="text-[10px] uppercase tracking-wide text-text-muted">Incremento do mês</p>
      <p className="text-text-muted">Planejado: {formatCurrencyMillions(d.Planejado)}</p>
      {d.Realizado !== null && (
        <p className="text-text-muted">Realizado: {formatCurrencyMillions(d.Realizado)}</p>
      )}
      {d.pct !== null && (
        <p className="mt-1 font-bold" style={{ color: d.banda?.cor }}>
          Desvio mensal: {d.pct >= 0 ? '+' : ''}{fmtPct(d.pct)}
        </p>
      )}
    </div>
  );
}

/**
 * Radar Executivo — Bento Grid fixo, 2 linhas x 2 colunas (Execução do Plano + Saúde
 * da Carteira / Projetos para Decisão + Revisar Caixa Ano), sem rolagem. Filtros
 * (período, Programa, status) escondidos por padrão. Uma única frase de síntese
 * substitui a tarja de status e o antigo card de insights.
 */
export function RadarExecutivo({
  lista,
  kpisEstrategicos,
  onSelect: _onSelect,
  isLoadingCompromisso = false,
}: {
  lista: ProjetoMetricas[];
  kpisEstrategicos: KPIEstrategicoCarteira[];
  onSelect: (p: ProjetoMetricas) => void;
  isLoadingCompromisso?: boolean;
}) {
  const periodo = useFilterStore(s => s.periodo);
  const setPeriodo = useFilterStore(s => s.setPeriodo);
  const [busca, setBusca] = useState("");
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [foco, setFoco] = useState<Foco>("todos");
  const [programa, setPrograma] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalFoco, setModalFoco] = useState<Foco | null>(null);

  const programas = useMemo(() => Array.from(new Set(lista.map((p) => p.n4Curta))).sort(), [lista]);

  // Programa filtra primeiro (é um recorte global), depois o foco de status.
  const listaPrograma = useMemo(
    () => (programa ? lista.filter((p) => p.n4Curta === programa) : lista),
    [lista, programa]
  );
  const listaComBusca = useMemo(
    () => (busca ? listaPrograma.filter((p) => p.nome.toLowerCase().includes(busca.toLowerCase())) : listaPrograma),
    [listaPrograma, busca]
  );
  const listaFocada = useMemo(() => {
    if (foco === "dentro") return listaComBusca.filter((p) => p.status === "Normal");
    if (foco === "acompanhar") return listaComBusca.filter((p) => p.status === "Revisar Caixa Ano");
    if (foco === "acao") return listaComBusca.filter((p) => p.status === "Estouro" || p.status === "Risco de Não Realização");
    if (foco === "faltantes") return listaComBusca.filter((p) => p.status === "Risco de Não Realização");
    if (foco === "excedentes") return listaComBusca.filter((p) => p.status === "Estouro" || p.status === "Revisar Caixa Ano");
    return listaComBusca;
  }, [listaComBusca, foco]);

  // Métricas macro para a Regra dos 5 Segundos
  const pctVsPlano = usePctExecucaoPlano(listaFocada);
  const risco = useMemo(() => generateRiskSummary(listaFocada), [listaFocada]);

  const saude = useMemo(() => {
    const normal = listaFocada.filter((p) => p.status === "Normal");
    const acompanhar = listaFocada.filter((p) => p.status === "Revisar Caixa Ano");
    const acao = listaFocada.filter((p) => p.status === "Estouro" || p.status === "Risco de Não Realização");
    const sum = (arr: ProjetoMetricas[]) => arr.reduce((a, p) => a + (p.orcamentoPeriodo ?? 0), 0);
    return {
      "Dentro do Plano": { n: normal.length, valor: sum(normal) },
      "Acompanhar": { n: acompanhar.length, valor: sum(acompanhar) },
      "Requer Ação": { n: acao.length, valor: sum(acao) },
    };
  }, [listaFocada]);

  // Gráfico de barras — Planejado × Realizado mensal, com cor condicional
  // no Realizado (verde ≤5%, amarelo 5-15%, vermelho >15% de desvio).
  // Executado agora vem de DADO REAL (aba "Realizado detalhado", por data de pagamento
  // de cada nota fiscal) quando disponível — nunca mais interpolado/estimado. Se a aba
  // não existir na planilha carregada, a série de Executado simplesmente não aparece
  // (preferimos mostrar menos do que mostrar algo sem respaldo nos dados).
  const temFluxoReal = useMemo(() => listaFocada.some((p) => p.executadoMensal2026 !== null), [listaFocada]);
  const fluxoData = useMemo(() => {
    // Canonical totals mirror exactly what the breakdown text displays — single source of truth.
    const canonicalRealizado = listaFocada.reduce((a, p) => a + (p.realizadoAcumulado ?? 0), 0);
    const canonicalPlanejado = listaFocada.reduce((a, p) => a + (p.planejadoAcumulado ?? 0), 0);

    const planejadoMensal = Array(12).fill(0);
    // realizadoMensal = caixa puro por data de pagamento (aba "Realizado detalhado"), sem Em Pagamento.
    const realizadoMensalArr = Array(12).fill(0);
    for (const p of listaFocada) {
      if (p.meses2026) p.meses2026.forEach((v, i) => { planejadoMensal[i] += v; });
      if (p.executadoMensal2026) p.executadoMensal2026.forEach((v, i) => { realizadoMensalArr[i] += v; });
    }

    // Reconcile: inject any delta into the last closed month so that the cumulative
    // at MES_ATUAL matches the canonical totals. This prevents divergence between the
    // "Realizado detalhado" sheet and the project-level totals used by the breakdown.
    const lastIdx = MES_ATUAL - 1;
    if (lastIdx >= 0) {
      if (temFluxoReal) {
        const sumReal = realizadoMensalArr.slice(0, MES_ATUAL).reduce((a, b) => a + b, 0);
        realizadoMensalArr[lastIdx] += canonicalRealizado - sumReal;
      }
      const sumPlan = planejadoMensal.slice(0, MES_ATUAL).reduce((a, b) => a + b, 0);
      planejadoMensal[lastIdx] += canonicalPlanejado - sumPlan;
    }

    let sumPlanejado = 0;
    let sumRealizado = 0;

    return MESES.map((m, i) => {
      const temExecEsteMes = i + 1 <= MES_ATUAL;
      const planejado = Math.round(planejadoMensal[i]);
      const realizado = temFluxoReal && temExecEsteMes ? Math.round(realizadoMensalArr[i]) : null;

      sumPlanejado += planejado;
      if (realizado !== null) sumRealizado += realizado;

      const pct = realizado !== null && planejado > 0 ? (realizado - planejado) / planejado : null;
      const banda = pct !== null ? bandaDelta(Math.abs(pct)) : null;
      const baseGapPositivo = realizado !== null ? Math.min(sumPlanejado, sumRealizado) : null;
      const gapPositivo = realizado !== null && sumPlanejado > sumRealizado ? sumPlanejado - sumRealizado : null;
      const baseGapNegativo = realizado !== null ? Math.min(sumPlanejado, sumRealizado) : null;
      const gapNegativo = realizado !== null && sumRealizado > sumPlanejado ? sumRealizado - sumPlanejado : null;
      return {
        mes: m,
        Planejado: planejado,
        Realizado: realizado,
        planejadoAcumulado: sumPlanejado,
        realizadoAcumulado: realizado !== null ? sumRealizado : null,
        baseGapPositivo,
        gapPositivo,
        baseGapNegativo,
        gapNegativo,
        pct, banda,
      };
    });
  }, [listaFocada, temFluxoReal]);

  const aEmitirAno = useAEmitirAno(listaFocada);
  const totalRealizadoBreakdown = useMemo(
    () => listaFocada.reduce((a, p) => a + (p.realizadoAcumulado ?? 0), 0),
    [listaFocada]
  );
  const totalEmPagamentoBreakdown = useMemo(
    () => listaFocada.reduce((a, p) => a + Math.max((p.executado ?? 0) - (p.realizadoAcumulado ?? 0), 0), 0),
    [listaFocada]
  );
  const totalEmitidoBreakdown = useMemo(
    () => listaFocada.reduce((a, p) => a + (p.compromisso ?? 0), 0),
    [listaFocada]
  );
  const totalOrcamentoBreakdown = useMemo(
    () => listaFocada.reduce((a, p) => a + (p.orcamentoPeriodo ?? 0), 0),
    [listaFocada]
  );
  const totalPlanejadoAcumulado = useMemo(
    () => listaFocada.reduce((a, p) => a + (p.planejadoAcumulado ?? 0), 0),
    [listaFocada]
  );

  const totalNaoEmitidoBreakdown = useMemo(() => {
    const restante = totalOrcamentoBreakdown - totalRealizadoBreakdown - totalEmPagamentoBreakdown - totalEmitidoBreakdown;
    return Math.max(restante, 0);
  }, [totalOrcamentoBreakdown, totalRealizadoBreakdown, totalEmPagamentoBreakdown, totalEmitidoBreakdown]);

  const breakdownSegments = useMemo(() => {
    const bruto = [
      { key: "realizado", label: "Realizado", valor: Math.max(totalRealizadoBreakdown, 0), ...BREAKDOWN_COLORS.realizado },
      { key: "emPagamento", label: "Em pgto", valor: Math.max(totalEmPagamentoBreakdown, 0), ...BREAKDOWN_COLORS.emPagamento },
      { key: "emitido", label: "Emitido", valor: Math.max(totalEmitidoBreakdown, 0), ...BREAKDOWN_COLORS.emitido },
      { key: "naoEmitido", label: "Não emitido", valor: totalNaoEmitidoBreakdown, ...BREAKDOWN_COLORS.naoEmitido },
    ] as const;

    const somaSegmentos = bruto.reduce((acc, seg) => acc + seg.valor, 0);
    const denominador = Math.max(totalOrcamentoBreakdown, somaSegmentos, 1);

    return bruto.map((seg) => ({
      ...seg,
      pct: (seg.valor / denominador) * 100,
    }));
  }, [
    totalOrcamentoBreakdown,
    totalRealizadoBreakdown,
    totalEmPagamentoBreakdown,
    totalEmitidoBreakdown,
    totalNaoEmitidoBreakdown,
  ]);

  const insightLinha = useMemo(() => {
    const ritmo = totalPlanejadoAcumulado > 0 ? totalRealizadoBreakdown / totalPlanejadoAcumulado : null;
    const ritmoTexto =
      ritmo === null
        ? "Ritmo de caixa N/D"
        : Math.abs(ritmo - 1) <= 0.05
        ? "Ritmo de caixa ok"
        : ritmo > 1
        ? "Ritmo de caixa acima do plano"
        : "Ritmo de caixa abaixo do plano";
    const pendente = aEmitirAno !== null && aEmitirAno > 0 ? aEmitirAno : risco.emissoesFaltantes.valor;
    return `${ritmoTexto} · Pontos de atenção: ${formatCurrencyMillions(pendente)} pendentes de emissão`;
  }, [aEmitirAno, risco.emissoesFaltantes.valor, totalPlanejadoAcumulado, totalRealizadoBreakdown]);

  const pendenteEmissao = aEmitirAno !== null && aEmitirAno > 0 ? aEmitirAno : risco.emissoesFaltantes.valor;
  const caixaKpi = useMemo(
    () => kpisEstrategicos.find((kpi) => kpi.id === "velocidadeCaixa") ?? null,
    [kpisEstrategicos]
  );
  const empenhoKpi = useMemo(
    () => kpisEstrategicos.find((kpi) => kpi.id === "empenho") ?? null,
    [kpisEstrategicos]
  );

  const focoLabel = {
    todos: null,
    dentro: "Dentro do Plano",
    acompanhar: "Acompanhar",
    acao: "Requer Ação",
    faltantes: "Emissões faltantes",
    excedentes: "Emissões excedentes",
  }[foco];

  // Determina qual lista mostrar na modal baseado em modalFoco
  const listaModalFoco = useMemo(() => {
    if (!modalFoco) return [];
    if (modalFoco === "dentro") return listaComBusca.filter((p) => p.status === "Normal");
    if (modalFoco === "acompanhar") return listaComBusca.filter((p) => p.status === "Revisar Caixa Ano");
    if (modalFoco === "acao") return listaComBusca.filter((p) => p.status === "Estouro" || p.status === "Risco de Não Realização");
    if (modalFoco === "faltantes") return listaComBusca.filter((p) => p.status === "Risco de Não Realização");
    if (modalFoco === "excedentes") return listaComBusca.filter((p) => p.status === "Estouro" || p.status === "Revisar Caixa Ano");
    return listaComBusca;
  }, [modalFoco, listaComBusca]);

  const modalTitle = {
    todos: "Projetos",
    dentro: "Dentro do Plano",
    acompanhar: "Acompanhar",
    acao: "Requer Ação",
    faltantes: "Emissões faltantes",
    excedentes: "Emissões excedentes",
  }[modalFoco ?? "todos"];

  const modalValorFn = (p: ProjetoMetricas): number | null => {
    if (modalFoco === "faltantes") return p.compromisso ?? 0;
    if (modalFoco === "excedentes") return (p.executado ?? 0) - (p.realizadoAcumulado ?? 0);
    return p.orcamentoPeriodo ?? 0;
  };

  const modalJustificativaFn = (p: ProjetoMetricas): string => {
    if (modalFoco === "faltantes") return `A emitir: ${formatCurrencyMillions(p.compromisso ?? 0)}`;
    if (modalFoco === "excedentes") return `Empenho: ${formatCurrencyMillions((p.executado ?? 0) - (p.realizadoAcumulado ?? 0))}`;
    return `Orçamento: ${formatCurrencyMillions(p.orcamentoPeriodo ?? 0)}`;
  };

  return (
    <div className="h-screen max-h-[calc(100vh-12rem)] flex flex-col max-lg:h-auto max-lg:max-h-none">
      <div className="mb-2 shrink-0">
        {(programa || focoLabel) && (
          <div className="mb-2 flex flex-wrap justify-end gap-2">
            {programa && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 border border-accent/40 text-accent px-2.5 py-0.5 text-[11px] font-bold">
                Programa: {programa}
              </span>
            )}
            {focoLabel && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 border border-accent/40 text-accent px-2.5 py-0.5 text-[11px] font-bold">
                Filtrado: {focoLabel}
              </span>
            )}
          </div>
        )}

        {/* Filtros — escondidos por padrão */}
        <button
          onClick={() => setMostrarFiltros((v) => !v)}
          aria-expanded={mostrarFiltros}
          aria-controls="radar-filtros-panel"
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
        >
          <SlidersHorizontal size={13} aria-hidden="true" /> Filtros
        </button>
        {mostrarFiltros && (
          <div id="radar-filtros-panel" className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
            {(["2026", "2027", "Todos"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                aria-pressed={periodo === p}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${
                  periodo === p ? "bg-accent text-white" : "bg-card-alt text-text-muted hover:text-text"
                }`}
              >
                {p === "Todos" ? "Todos os anos" : p}
              </button>
            ))}

            <select
              value={programa ?? ""}
              onChange={(e) => setPrograma(e.target.value || null)}
              className="rounded-full border border-border bg-card-alt px-3 py-1.5 text-xs text-text outline-none focus:border-accent"
            >
              <option value="">Programa: Todos</option>
              {programas.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>

            {([
              { key: "todos", label: "Todos" },
              { key: "dentro", label: "Dentro do Plano" },
              { key: "acompanhar", label: "Acompanhar" },
              { key: "acao", label: "Requer Ação" },
            ] as const).map((f) => (
              <button
                key={f.key}
                onClick={() => setFoco(f.key)}
                aria-pressed={foco === f.key}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${
                  foco === f.key ? "bg-accent text-white" : "bg-card-alt text-text-muted hover:text-text"
                }`}
              >
                {f.label}
              </button>
            ))}

            <div className="relative ml-auto max-w-xs w-full">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar projeto…"
                aria-label="Buscar projeto no Radar"
                className="w-full rounded-full border border-border bg-card-alt pl-8 pr-3 py-1.5 text-xs text-text placeholder:text-text-faint outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/70"
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-12 gap-4 flex-1 min-h-0 max-lg:grid-cols-1 max-lg:h-auto">
        <section className="col-span-8 min-h-0 flex flex-col gap-4 overflow-y-auto pr-1 max-lg:col-span-1 max-lg:overflow-visible max-lg:pr-0" style={{ scrollbarGutter: "stable" }}>
          <article className="rounded-card border border-border bg-gradient-to-r from-slate-900 via-slate-800 to-zinc-800 p-4 text-white shadow-card shrink-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/75 mb-2">Execução do Plano</p>

            {pctVsPlano !== null && (
              <div className="flex flex-row items-center justify-between w-full gap-4">
                <div className="shrink-0">
                  <p
                    aria-label={`${fmtPct(pctVsPlano)} do plano YTD realizado`}
                    className={`text-[3rem] leading-none font-extrabold tabular-nums ${
                      Math.abs(pctVsPlano - 1) <= 0.05
                        ? "text-emerald-300"
                        : Math.abs(pctVsPlano - 1) <= 0.15
                        ? "text-amber-300"
                        : "text-red-300"
                    }`}
                  >
                    {fmtPct(pctVsPlano)}
                  </p>
                  <p className="text-[11px] text-white/65 mt-1">vs. Plano YTD</p>
                </div>

                <div className="flex-1 min-w-0 max-w-[620px]">
                  <div className="flex h-4 rounded-md overflow-hidden bg-white/15 gap-0.5">
                    {breakdownSegments.map((seg) => (
                      <div
                        key={seg.key}
                        className={`${seg.bg} flex items-center justify-center px-1 text-[8px] font-bold whitespace-nowrap overflow-hidden`}
                        style={{ width: `${seg.pct}%` }}
                        title={`${seg.label}: ${fmtPct(seg.pct / 100)} · ${formatCurrencyMillions(seg.valor)}`}
                      >
                        {seg.pct >= 18 ? fmtPct(seg.pct / 100) : ""}
                      </div>
                    ))}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {breakdownSegments.filter((seg) => seg.pct > 0).map((seg) => (
                      <span key={`legend-${seg.key}`} className="text-[10px] text-white/90 leading-none flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${seg.bg}`} aria-hidden="true" />
                        {seg.label}: {fmtPct(seg.pct / 100)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-2.5 flex items-center gap-2 text-[12px] leading-snug text-white/90">
              {risco.emissoesExcedentes.n > 0 ? (
                <AlertTriangle size={14} className="shrink-0 text-amber-300" aria-hidden="true" />
              ) : (
                <CheckCircle2 size={14} className="shrink-0 text-emerald-300" aria-hidden="true" />
              )}
              <p className="truncate">{insightLinha}</p>
            </div>
            <p className="mt-1 text-[12px] font-semibold text-amber-200">
              {formatCurrencyMillions(pendenteEmissao)} pendentes de emissão
            </p>
          </article>

          <article className="rounded-card border border-border bg-card p-3 shadow-card flex-1 min-h-0">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-sm font-semibold text-text">Fluxo de Caixa: Planejado × Realizado</p>
              </div>
              {foco !== "todos" && (
                <button
                  onClick={() => { setFoco("todos"); setModalFoco(null); }}
                  className="shrink-0 text-[11px] font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 rounded"
                >
                  Limpar filtro
                </button>
              )}
            </div>

            {temFluxoReal ? (
              <ResponsiveContainer width="100%" height="90%">
                <ComposedChart data={fluxoData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="areaPlanejado" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.07} />
                    </linearGradient>
                    <linearGradient id="areaRealizado" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10B981" stopOpacity={0.33} />
                      <stop offset="100%" stopColor="#10B981" stopOpacity={0.08} />
                    </linearGradient>
                  </defs>

                  <XAxis dataKey="mes" stroke="rgba(82,82,91,0.9)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis
                    domain={["auto", "auto"]}
                    stroke="rgba(82,82,91,0.9)"
                    tick={{ fill: "rgba(82,82,91,0.9)", fontSize: 11, fontWeight: 600 }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tickFormatter={(v) => formatCurrencyMillions(Number(v ?? 0)).replace("R$ ", "")}
                  />
                  <Tooltip content={<CustomTooltipFluxo />} cursor={{ stroke: "rgba(82,82,91,0.25)", strokeWidth: 1 }} />

                  <Area
                    type="monotone"
                    dataKey="planejadoAcumulado"
                    name="Planejado (acum.)"
                    stroke="#2563EB"
                    strokeWidth={2.2}
                    fill="url(#areaPlanejado)"
                    dot={false}
                    activeDot={{ r: 3, fill: "#2563EB" }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="planejadoAcumulado"
                    stroke="#2563EB"
                    strokeWidth={2.2}
                    dot={false}
                    activeDot={false}
                    legendType="none"
                  />

                  <Area
                    type="monotone"
                    dataKey="realizadoAcumulado"
                    name="Realizado (acum.)"
                    stroke="#059669"
                    strokeWidth={2.4}
                    fill="url(#areaRealizado)"
                    dot={false}
                    activeDot={{ r: 3, fill: "#059669" }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="realizadoAcumulado"
                    stroke="#059669"
                    strokeWidth={2.4}
                    dot={false}
                    activeDot={false}
                    connectNulls={false}
                    legendType="none"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : isLoadingCompromisso ? (
              <div role="status" aria-label="Carregando gráfico de fluxo…" className="h-[86%] w-full rounded-lg bg-card-alt animate-pulse" />
            ) : (
              <div className="h-[86%] flex items-center justify-center text-center px-6">
                <p className="text-xs text-text-muted leading-snug">
                  Sem dado mensal real de Executado nesta planilha (aba "Realizado detalhado" ausente).
                  Nenhuma estimativa é exibida.
                </p>
              </div>
            )}
          </article>
        </section>

        <aside className="col-span-4 min-h-0 rounded-card border border-border bg-card p-2 shadow-card flex flex-col gap-2 overflow-y-auto pr-1 max-lg:col-span-1 max-lg:overflow-visible" style={{ scrollbarGutter: "stable" }}>
          <div>
            <p className="text-sm font-semibold text-text">Análise de Risco</p>
            <p className="text-[11px] text-text-muted">Saúde, sinais de caixa/empenho e ofensores de emissão</p>
          </div>

          <section className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Saúde da Carteira</p>
            {(["Dentro do Plano", "Acompanhar", "Requer Ação"] as const).map((s) => {
              const b = saude[s];
              const focoAlvo: Foco = s === "Requer Ação" ? "acao" : s === "Acompanhar" ? "acompanhar" : "dentro";
              const ativo = foco === focoAlvo;
              return (
                <button
                  key={s}
                  onClick={() => {
                    if (foco === focoAlvo) { setFoco("todos"); setModalFoco(null); }
                    else { setFoco(focoAlvo); setModalFoco(focoAlvo); setModalOpen(true); }
                  }}
                  aria-pressed={ativo}
                  className={`w-full rounded-lg px-2.5 py-1.5 flex items-center justify-between text-[11px] ${SAUDE_STYLE[s]} ${ativo ? "ring-2 ring-accent" : ""} hover:brightness-110 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
                >
                  <span className={`font-semibold ${s === "Requer Ação" ? "text-sm" : ""}`}>{s}</span>
                  <span className="flex items-center gap-2">
                    <span>{b.n} proj.</span>
                    <span className="font-bold">{formatCurrencyMillions(b.valor)}</span>
                    <ChevronRight size={12} />
                  </span>
                </button>
              );
            })}
          </section>

          <section className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Fatores de Risco (Caixa / Empenho)</p>
            {[{ id: "CAIXA", kpi: caixaKpi }, { id: "EMPENHO", kpi: empenhoKpi }].map(({ id, kpi }) => (
              <div key={id} className="rounded-lg bg-card-alt px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold tracking-wide text-text-muted">{id}</span>
                  <span className="text-xs font-semibold text-text">{kpi?.statusLabel ?? "Dados insuficientes"}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-text-muted leading-snug">{kpi?.descricaoExecutiva ?? "Sem dados suficientes para avaliação."}</p>
              </div>
            ))}
          </section>

          <section className="space-y-1 min-h-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Top Ofensores</p>
            <div className="grid grid-cols-1 gap-1.5">
              <button
                onClick={() => {
                  if (foco === "faltantes") { setFoco("todos"); setModalFoco(null); }
                  else { setFoco("faltantes"); setModalFoco("faltantes"); setModalOpen(true); }
                }}
                aria-pressed={foco === "faltantes"}
                className={`rounded-lg bg-card-alt px-2.5 py-1.5 text-left transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  foco === "faltantes" ? "ring-2 ring-accent" : ""
                }`}
              >
                <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">Emissões Faltantes</p>
                {isLoadingCompromisso ? (
                  <>
                    <SkeletonBlock className="h-6 w-14 mt-2" />
                    <SkeletonBlock className="h-3 w-28 mt-2" />
                  </>
                ) : (
                  <div className="mt-1 flex items-center justify-between gap-2.5">
                    <span className="text-2xl font-extrabold text-text">{risco.emissoesFaltantes.n}</span>
                    <span className="text-xs font-semibold text-text-muted">{formatCurrencyMillions(risco.emissoesFaltantes.valor)}</span>
                  </div>
                )}
              </button>

              <button
                onClick={() => {
                  if (foco === "excedentes") { setFoco("todos"); setModalFoco(null); }
                  else { setFoco("excedentes"); setModalFoco("excedentes"); setModalOpen(true); }
                }}
                aria-pressed={foco === "excedentes"}
                className={`rounded-lg bg-card-alt px-2.5 py-1.5 text-left transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  foco === "excedentes" ? "ring-2 ring-accent" : ""
                }`}
              >
                <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">Emissões Excedentes</p>
                {isLoadingCompromisso ? (
                  <>
                    <SkeletonBlock className="h-6 w-14 mt-2" />
                    <SkeletonBlock className="h-3 w-28 mt-2" />
                  </>
                ) : (
                  <div className="mt-1 flex items-center justify-between gap-2.5">
                    <span className="text-2xl font-extrabold text-text">{risco.emissoesExcedentes.n}</span>
                    <span className="text-xs font-semibold text-text-muted">{formatCurrencyMillions(Math.abs(risco.emissoesExcedentes.valor))}</span>
                  </div>
                )}
              </button>
            </div>
          </section>
        </aside>
      </div>

      {/* Modal de Lista de Projetos Filtrada */}
      <ProjectListModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setFoco("todos"); setModalFoco(null); }}
        title={modalTitle}
        projetos={listaModalFoco}
        valorFn={modalValorFn}
        justificativaFn={modalJustificativaFn}
        onSelectProject={_onSelect}
      />
    </div>
  );
}
