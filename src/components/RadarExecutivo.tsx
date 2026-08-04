import { useMemo, useState } from "react";
import { BarChart, Bar, Cell, XAxis, ResponsiveContainer, Legend, Tooltip } from "recharts";
import type { KPIEstrategicoCarteira, ProjetoMetricas, StatusSemaforo } from "../types";
import { useFilterStore } from "../store/filterStore";
import { generateRiskSummary } from "../lib/insights";
import { fmtPct, formatCurrencyMillions } from "../lib/format";
import { usePctExecucaoPlano, useAEmitirAno } from "../hooks/usePortfolioMetrics";
import { ProjectListModal } from "./ProjectListModal";

import { Search, SlidersHorizontal, ChevronRight, HelpCircle, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
// Trava M-1: barras do gráfico só são coloridas até o mês fechado anterior.
const _mesRealRadar = new Date().getMonth() + 1;
const MES_ATUAL = _mesRealRadar === 1 ? 12 : _mesRealRadar - 1;

const SAUDE_STYLE: Record<string, string> = {
  "Dentro do Plano": "bg-risk-baixo/10 border-risk-baixo/30 text-risk-baixo",
  "Acompanhar": "bg-risk-medio/10 border-risk-medio/30 text-amber-600",
  "Requer Ação": "bg-risk-alto/10 border-risk-alto/30 text-risk-alto",
};

/** Paleta semântica para segmentos de composição do Gráfico A */
const BREAKDOWN_COLORS: Record<string, { bg: string; text: string; colorHex: string }> = {
  realizado: { bg: "bg-emerald-500", text: "text-emerald-900", colorHex: "#10b981" },
  emPagamento: { bg: "bg-amber-500", text: "text-amber-900", colorHex: "#f59e0b" },
  emitido: { bg: "bg-red-500", text: "text-red-900", colorHex: "#ef4444" },
  naoEmitido: { bg: "bg-slate-500", text: "text-slate-900", colorHex: "#64748b" },
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
const KPI_STATUS_STYLE: Record<Exclude<StatusSemaforo, "nd">, string> = {
  verde: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  amarelo: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  vermelho: "border-red-500/40 bg-red-500/10 text-red-700",
};

function fmtKpiValue(kpi: KPIEstrategicoCarteira): string {
  if (kpi.valor === null || Number.isNaN(kpi.valor)) return "N/D";
  if (kpi.id === "equilibrioFinanceiro") {
    return `${(kpi.valor * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
  }
  return `${kpi.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
}


export function RadarExecutivo({
  lista,
  kpisEstrategicos,
  onSelect: _onSelect,
}: {
  lista: ProjetoMetricas[];
  kpisEstrategicos: KPIEstrategicoCarteira[];
  onSelect: (p: ProjetoMetricas) => void;
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
      return {
        mes: m,
        Planejado: planejado,
        Realizado: realizado,
        planejadoAcumulado: sumPlanejado,
        realizadoAcumulado: realizado !== null ? sumRealizado : null,
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
    return `${ritmoTexto} · Atenção: ${formatCurrencyMillions(pendente)} pendente de emissão`;
  }, [aEmitirAno, risco.emissoesFaltantes.valor, totalPlanejadoAcumulado, totalRealizadoBreakdown]);

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
    <div>
      {/* Filtros — escondidos por padrão */}
      <div className="mb-4">
        <button
          onClick={() => setMostrarFiltros((v) => !v)}
          aria-expanded={mostrarFiltros}
          aria-controls="radar-filtros-panel"
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
        >
          <SlidersHorizontal size={13} aria-hidden="true" /> Filtros
        </button>
        {mostrarFiltros && (
          <div id="radar-filtros-panel" className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2.5">
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

      {(programa || focoLabel) && (
        <div className="flex flex-wrap gap-2 mb-3">
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

      {/* ✅ Linha 1: Execução do Plano — bloco único acima da linha de risco */}
      <div className="mb-4">
        <div className="rounded-card bg-hero p-6 shadow-card text-white flex flex-col">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/70 mb-1">Execução do Plano</p>

          {/* Regra dos 5 Segundos: % vs plano é o indicador macro dominante */}
          {pctVsPlano !== null && (
            <div className="flex flex-col gap-3 mb-2">
              {/* Linha 1: Número + Barra Compacta lado a lado */}
              <div className="flex items-center gap-3">
                <span
                  aria-label={`${fmtPct(pctVsPlano)} do plano YTD realizado`}
                  className={`text-5xl font-extrabold leading-none tabular-nums shrink-0 ${
                    Math.abs(pctVsPlano - 1) <= 0.05
                      ? "text-emerald-300"
                      : Math.abs(pctVsPlano - 1) <= 0.15
                      ? "text-amber-300"
                      : "text-red-300"
                  }`}
                >
                  {fmtPct(pctVsPlano)}
                </span>
                <div className="flex flex-col gap-1 flex-1">
                  <div className="flex w-full h-6 rounded-md overflow-hidden bg-white/15 gap-0.5">
                    {breakdownSegments.map((seg) => (
                      <div
                        key={seg.key}
                        className={`${seg.bg} flex items-center justify-center px-1 text-[9px] font-bold whitespace-nowrap overflow-hidden`}
                        style={{ width: `${seg.pct}%` }}
                        title={`${seg.label}: ${fmtPct(seg.pct / 100)} · ${formatCurrencyMillions(seg.valor)}`}
                      >
                        {seg.pct >= 16 ? fmtPct(seg.pct / 100) : ""}
                      </div>
                    ))}
                  </div>
                  {/* Legenda discreta */}
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                    {breakdownSegments.filter((seg) => seg.pct > 0).map((seg) => (
                      <span key={`legend-${seg.key}`} className="text-[9px] text-white/70 leading-none flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${seg.bg}`} aria-hidden="true" />
                        {seg.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="text-xs text-white/70 leading-tight">
                % Execução provisionada
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 mb-4 text-sm text-white/90 leading-snug max-w-full">
            {risco.emissoesExcedentes.n > 0 ? (
              <AlertTriangle size={15} className="shrink-0 text-amber-300" aria-hidden="true" />
            ) : (
              <CheckCircle2 size={15} className="shrink-0 text-emerald-300" aria-hidden="true" />
            )}
            <p className="whitespace-nowrap overflow-hidden text-ellipsis">{insightLinha}</p>
          </div>

          <div className="bg-white/10 rounded-xl p-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/75 mb-1 px-1">
              Fluxo de caixa: planejado × realizado
            </p>
            {temFluxoReal ? (
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={fluxoData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2}>
                  <XAxis dataKey="mes" stroke="#FFFFFF" fontSize={10} fontWeight={600} tickLine={false} axisLine={false} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#FFFFFF", fontWeight: 700 }} />
                  <Tooltip content={<CustomTooltipFluxo />} cursor={{ fill: "rgba(255,255,255,0.08)" }} />
                  {/* ✅ Barras acumuladas mês a mês; sem LabelList; tooltip expõe acumulado + incremento */}
                  <Bar dataKey="planejadoAcumulado" name="Planejado (acum.)" fill="#C9BFF0" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="realizadoAcumulado" name="Realizado (acum.)" fill="#8B7FE8" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[150px] flex items-center justify-center text-center px-6">
                <p className="text-xs text-white/80 leading-snug">
                  Sem dado mensal real de Executado nesta planilha (aba "Realizado detalhado" ausente).
                  Nenhuma estimativa é exibida — Executado YTD acima é o único valor confiável disponível.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ✅ Linha 2: Gestão de Risco — 3 cards iguais sob cabeçalho único */}
      <div className="mb-4">
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Gestão de Risco (Caixa / Empenho)</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <button
            onClick={() => {
              setFoco("faltantes");
              setModalFoco("faltantes");
              setModalOpen(true);
            }}
            aria-pressed={foco === "faltantes"}
            className={`rounded-card border border-border bg-card p-5 shadow-card text-left transition-colors hover:bg-card-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              foco === "faltantes" ? "ring-2 ring-accent" : ""
            }`}
          >
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Emissões faltantes</p>
            <div className="text-3xl font-extrabold text-text mt-2">{risco.emissoesFaltantes.n}</div>
            <p className="text-xs text-text-muted mt-1">{formatCurrencyMillions(risco.emissoesFaltantes.valor)} em pendência</p>
            <p className="text-[11px] text-text-faint mt-3 pt-2 border-t border-border-subtle">clique abre lista completa</p>
          </button>

          <button
            onClick={() => {
              setFoco("excedentes");
              setModalFoco("excedentes");
              setModalOpen(true);
            }}
            aria-pressed={foco === "excedentes"}
            className={`rounded-card border border-border bg-card p-5 shadow-card text-left transition-colors hover:bg-card-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              foco === "excedentes" ? "ring-2 ring-accent" : ""
            }`}
          >
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Emissões excedentes</p>
            <div className="text-3xl font-extrabold text-text mt-2">{risco.emissoesExcedentes.n}</div>
            <p className="text-xs text-text-muted mt-1">{formatCurrencyMillions(risco.emissoesExcedentes.valor)} em exposição</p>
            <p className="text-[11px] text-text-faint mt-3 pt-2 border-t border-border-subtle">clique abre lista completa</p>
          </button>

          <div className="rounded-card border border-border bg-card p-5 shadow-card">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Saúde da Carteira</p>
            <div className="space-y-2">
              {(["Dentro do Plano", "Acompanhar", "Requer Ação"] as const).map((s) => {
                const b = saude[s];
                const focoAlvo: Foco = s === "Requer Ação" ? "acao" : s === "Acompanhar" ? "acompanhar" : "dentro";
                const ativo = foco === focoAlvo;
                return (
                  <button
                    key={s}
                    onClick={() => {
                      setFoco(focoAlvo);
                      setModalFoco(focoAlvo);
                      setModalOpen(true);
                    }}
                    aria-pressed={ativo}
                    className={`w-full rounded-lg border px-3 py-2 flex items-center justify-between text-xs ${SAUDE_STYLE[s]} ${ativo ? "ring-2 ring-accent" : ""} hover:brightness-110 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
                  >
                    <span className="font-semibold">{s}</span>
                    <span className="flex items-center gap-2">
                      <span>{b.n} proj.</span>
                      <span className="font-bold">{formatCurrencyMillions(b.valor)}</span>
                      <ChevronRight size={12} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Grid de KPIs Estratégicos com novo design — Interpretação em primeiro plano */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 mt-4">
        {kpisEstrategicos.map((kpi) => {
          const badgeClass = kpi.status === "nd" ? "border-border/60 bg-card-alt text-text-faint" : KPI_STATUS_STYLE[kpi.status];

          const statusIcon =
            kpi.status === "verde" ? <CheckCircle2 className="w-5 h-5 text-emerald-500" aria-hidden="true" /> :
            kpi.status === "amarelo" ? <AlertTriangle className="w-5 h-5 text-amber-500" aria-hidden="true" /> :
            kpi.status === "vermelho" ? <XCircle className="w-5 h-5 text-red-500" aria-hidden="true" /> :
            <HelpCircle className="w-5 h-5 text-text-faint" aria-hidden="true" />;

          const tooltipContent = kpi.tooltipDetalhado;

          const footerText =
            kpi.id === "velocidadeCaixa" && kpi.valor !== null
              ? `Desvio plan x real acumulado: ${Math.abs(kpi.valor - 1) < 0.1 ? "< 10%" : fmtPct(Math.abs(kpi.valor - 1))}`
              : kpi.id === "empenho"
              ? `A emitir ano = ${aEmitirAno !== null ? formatCurrencyMillions(aEmitirAno) : "N/D"}`
              : kpi.id === "equilibrioFinanceiro" && kpi.valor !== null
              ? `Resultado: ${fmtKpiValue(kpi)} do orçamento comprometido`
              : "N/D";

          return (
            <article
              key={kpi.id}
              className="rounded-card border border-border bg-card p-4 shadow-card flex flex-col gap-2 items-start text-left"
              aria-label={`${kpi.nome}: ${kpi.statusLabel}. ${kpi.descricaoExecutiva}`}
            >
              {/* Topo: Título uppercase + ajuda */}
              <div className="flex items-center justify-between gap-2 w-full">
                <p className="text-[11px] uppercase tracking-wide font-semibold text-text-muted">{kpi.nome}</p>
                <button
                  type="button"
                  className="text-text-faint hover:text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 rounded"
                  aria-label={`Informações sobre ${kpi.nome}`}
                  title={tooltipContent}
                >
                  <HelpCircle size={14} />
                </button>
              </div>

              {/* Meio: Ícone Lucide + Badge de Status */}
              <div className="flex items-center gap-2">
                {statusIcon}
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${badgeClass}`}>
                  {kpi.statusLabel ?? "Dados insuficientes"}
                </span>
              </div>

              {/* Descrição Executiva */}
              <p className="text-sm text-text-muted leading-relaxed text-left">
                {kpi.descricaoExecutiva}
              </p>

              {/* Rodapé com linha divisória */}
              <div className="border-t border-border mt-auto pt-2 w-full">
                <p className="text-[10px] text-text-faint">{footerText}</p>
              </div>
            </article>
          );
        })}
      </div>

      {/* Modal de Lista de Projetos Filtrada */}
      <ProjectListModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        projetos={listaModalFoco}
        valorFn={modalValorFn}
        justificativaFn={modalJustificativaFn}
        onSelectProject={_onSelect}
      />
    </div>
  );
}
