import { useMemo, useState } from "react";
import { BarChart, Bar, Cell, XAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";
import type { KPIEstrategicoCarteira, ProjetoMetricas, StatusSemaforo } from "../types";
import { useFilterStore } from "../store/filterStore";
import { useThemeStore } from "../store/themeStore";
import { getChartColors } from "../lib/chartColors";
import { generateDeltaYTD, generateHeroNarrative, generateRiskSummary } from "../lib/insights";
import { fmtPct, formatCurrencyMillions } from "../lib/format";
import { RiskBadge } from "./ui/primitives";
import { ProjectListModal } from "./ProjectListModal";
import { usePctExecucaoPlano, useAEmitirAno } from "../hooks/usePortfolioMetrics";

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

/** Banda de aderência ao plano por mês — usada para colorir a barra de Executado. */
function bandaDelta(pctAbs: number): { cor: string; label: string } {
  if (pctAbs <= 0.05) return { cor: "#2A9D6F", label: "Dentro do Plano" };
  if (pctAbs <= 0.15) return { cor: "#E0B429", label: "Acompanhar" };
  return { cor: "#C0392B", label: "Requer Ação" };
}

function acaoLabel(p: ProjetoMetricas): string {
  if (p.status === "Estouro") return "Replanejar";
  return "Risco NR";
}

type Foco = "todos" | "dentro" | "acompanhar" | "acao";

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
  onSelect,
}: {
  lista: ProjetoMetricas[];
  kpisEstrategicos: KPIEstrategicoCarteira[];
  onSelect: (p: ProjetoMetricas) => void;
}) {
  const periodo = useFilterStore(s => s.periodo);
  const setPeriodo = useFilterStore(s => s.setPeriodo);
  const theme = useThemeStore(s => s.theme);
  const colors = getChartColors(theme);
  const [busca, setBusca] = useState("");
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [foco, setFoco] = useState<Foco>("todos");
  const [programa, setPrograma] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState<"acao" | "revisao" | null>(null);

  const programas = useMemo(() => Array.from(new Set(lista.map((p) => p.n4Curta))).sort(), [lista]);

  // Programa filtra primeiro (é um recorte global), depois o foco de status.
  const listaPrograma = useMemo(
    () => (programa ? lista.filter((p) => p.n4Curta === programa) : lista),
    [lista, programa]
  );
  const listaFocada = useMemo(() => {
    if (foco === "dentro") return listaPrograma.filter((p) => p.status === "Normal");
    if (foco === "acompanhar") return listaPrograma.filter((p) => p.status === "Revisar Caixa Ano");
    if (foco === "acao") return listaPrograma.filter((p) => p.status === "Estouro" || p.status === "Risco de Não Realização");
    return listaPrograma;
  }, [listaPrograma, foco]);

  const delta = useMemo(() => generateDeltaYTD(listaFocada), [listaFocada]);
  const narrativa = useMemo(() => generateHeroNarrative(listaFocada, delta), [listaFocada, delta]);

  // Métricas macro para a Regra dos 5 Segundos
  const pctVsPlano = usePctExecucaoPlano(listaFocada);
  const exigemAcao = useMemo(
    () => listaFocada.filter((p) => p.status === "Estouro" || p.status === "Risco de Não Realização")
      .filter((p) => p.nome.toLowerCase().includes(busca.toLowerCase()))
      .sort((a, b) => b.riscoScore - a.riscoScore),
    [listaFocada, busca]
  );
  const revisaoCaixa = useMemo(
    () => listaFocada.filter((p) => p.status === "Revisar Caixa Ano").filter((p) => p.nome.toLowerCase().includes(busca.toLowerCase())),
    [listaFocada, busca]
  );

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

  // Gráfico de barras — Planejado × Executado acumulado, mensal, com cor condicional
  // no Executado (verde ≤5%, amarelo 5-15%, vermelho >15% de desvio).
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

    let acumuladoPlan = 0;
    let acumuladoReal = 0;
    return MESES.map((m, i) => {
      acumuladoPlan += planejadoMensal[i];
      acumuladoReal += realizadoMensalArr[i];
      const temExecEsteMes = i + 1 <= MES_ATUAL;
      const realizado = temFluxoReal && temExecEsteMes ? acumuladoReal : null;
      const pct = realizado !== null && acumuladoPlan > 0 ? (realizado - acumuladoPlan) / acumuladoPlan : null;
      const banda = pct !== null ? bandaDelta(Math.abs(pct)) : null;
      return {
        mes: m,
        Planejado: Math.round(acumuladoPlan),
        Realizado: realizado !== null ? Math.round(realizado) : null,
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

  const narrativaRisco = useMemo(() => {
    const represadoTotal = listaFocada
      .filter(p => p.status === "Risco de Não Realização")
      .reduce((a, p) => a + Math.max(p.aEmitir ?? 0, 0), 0);
    const estouraoTotal = listaFocada
      .filter(p => p.status === "Estouro")
      .reduce((a, p) => a + Math.max(p.desvioPlurianual ?? 0, 0), 0);
    // Compara caixa puro (realizadoAcumulado) contra o planejado — sem Em Pagamento.
    const pctExec = totalPlanejadoAcumulado > 0
      ? totalRealizadoBreakdown / totalPlanejadoAcumulado
      : null;
    const execBase = pctExec === null
      ? "Carteira"
      : Math.abs(pctExec - 1) <= 0.05
      ? "Carteira tem realizado dentro do plano"
      : pctExec > 1 ? "Carteira tem realizado acima do plano" : "Carteira tem realizado abaixo do plano";
    if (represadoTotal > estouraoTotal && represadoTotal > 0) {
      // Usa aEmitirAno — mesma variável do rodapé do card "Gestão do Empenho" (SSOT).
      const valorRepresadoGlobal = aEmitirAno !== null && aEmitirAno > 0 ? aEmitirAno : represadoTotal;
      return `${execBase}, porém o maior impacto está nos ${formatCurrencyMillions(valorRepresadoGlobal)} represados aguardando emissão.`;
    }
    if (estouraoTotal > 0) {
      return `${execBase}, com leve descasamento abaixo do planejado em BG e orçamento (${formatCurrencyMillions(estouraoTotal)} em possível estouro).`;
    }
    return narrativa;
  }, [listaFocada, delta, narrativa, totalRealizadoBreakdown, totalPlanejadoAcumulado, aEmitirAno]);

  const mostrarAcao = foco !== "acompanhar";
  const mostrarRevisao = foco === "todos" || foco === "acompanhar";
  const focoLabel = { todos: null, dentro: "Dentro do Plano", acompanhar: "Acompanhar", acao: "Requer Ação" }[foco];

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

      {/* Grid de KPIs Estratégicos com novo design — Interpretação em primeiro plano */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
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

      {/* Linha 1: Execução do Plano + Saúde da Carteira */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 rounded-card bg-hero p-6 shadow-card text-white flex flex-col">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/70 mb-1">Execução do Plano</p>

          {/* Regra dos 5 Segundos: % vs plano é o indicador macro dominante */}
          {pctVsPlano !== null && (
            <div className="flex items-end gap-2.5 mb-1">
              <span
                aria-label={`${fmtPct(pctVsPlano)} do plano YTD realizado`}
                className={`text-5xl font-extrabold leading-none tabular-nums ${
                  Math.abs(pctVsPlano - 1) <= 0.05
                    ? "text-emerald-300"
                    : Math.abs(pctVsPlano - 1) <= 0.15
                    ? "text-amber-300"
                    : "text-red-300"
                }`}
              >
                {fmtPct(pctVsPlano)}
              </span>
              <span className="text-[11px] text-white/70 mb-1.5 leading-tight">
                % Execução<br />provisionada
              </span>
            </div>
          )}
          {pctVsPlano !== null && (
            <div className="flex flex-col gap-1 mb-3">
              <span className="text-[11px] text-white/55 leading-snug">
                {totalOrcamentoBreakdown > 0 ? fmtPct(totalRealizadoBreakdown / totalOrcamentoBreakdown) : "N/D"} – {formatCurrencyMillions(totalRealizadoBreakdown)} Realizado
              </span>
              <span className="text-[11px] text-white/55 leading-snug">
                {totalOrcamentoBreakdown > 0 ? fmtPct(totalEmPagamentoBreakdown / totalOrcamentoBreakdown) : "N/D"} – {formatCurrencyMillions(totalEmPagamentoBreakdown)} Em pagamento
              </span>
              <span className="text-[11px] text-white/55 leading-snug">
                {totalOrcamentoBreakdown > 0 ? fmtPct(totalEmitidoBreakdown / totalOrcamentoBreakdown) : "N/D"} – {formatCurrencyMillions(totalEmitidoBreakdown)} Emitidos
              </span>
            </div>
          )}

          <p className="text-sm text-white/90 leading-snug mb-4 max-w-lg">{narrativaRisco}</p>

          <div className="bg-white/10 rounded-xl p-2">
            {temFluxoReal ? (
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={fluxoData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2}>
                  <XAxis dataKey="mes" stroke="#FFFFFF" fontSize={10} fontWeight={600} tickLine={false} axisLine={false} />
                  <Tooltip content={<FluxoTooltip colors={colors} />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#FFFFFF", fontWeight: 700 }} />
                  <Bar dataKey="Planejado" name="Planejado" fill="#C9BFF0" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Realizado" name="Realizado" radius={[3, 3, 0, 0]}>
                    {fluxoData.map((d, i) => (
                      <Cell key={i} fill={d.banda ? d.banda.cor : "#8B7FE8"} />
                    ))}
                  </Bar>
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
                  onClick={() => setFoco(ativo ? "todos" : focoAlvo)}
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

      {/* Linha 2: Projetos para Decisão + Revisar Caixa Ano */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {mostrarAcao && (
          <div className={`${mostrarRevisao ? "lg:col-span-2" : "lg:col-span-3"} rounded-card border border-border bg-card p-5 shadow-card`}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Revisar Empenho</p>
              {exigemAcao.length > 5 && (
                <button onClick={() => setModalAberto("acao")} className="text-[11px] font-semibold text-accent hover:underline">
                  Ver Todos ({exigemAcao.length})
                </button>
              )}
            </div>
            <div className="text-3xl font-extrabold text-text mt-2">{risco.nCriticos}</div>
            <p className="text-xs text-text-muted mt-1">
              {formatCurrencyMillions(risco.estouro.valor + risco.riscoNaoRealizacao.valor)} em exposição
            </p>
            {exigemAcao.length === 0 ? (
              <p className="text-xs text-text-faint mt-3">Nenhum projeto exige decisão nos filtros atuais.</p>
            ) : (
              <div className="mt-3 space-y-1.5 border-t border-border-subtle pt-2">
                {exigemAcao.slice(0, 5).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onSelect(p)}
                    className="w-full flex items-center justify-between gap-2 text-left text-xs rounded-lg px-2.5 py-2 hover:bg-card-alt transition-colors border border-transparent hover:border-border"
                  >
                    <span className="text-text truncate flex-1">{p.nome}</span>
                    <span className="text-text-muted shrink-0">{formatCurrencyMillions(p.status === "Estouro" ? p.desvioPlurianual : p.aEmitir)}</span>
                    <span className="text-accent font-semibold shrink-0">{acaoLabel(p)}</span>
                    <RiskBadge status={p.status} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {mostrarRevisao && (
          <div className="rounded-card border border-border bg-card p-5 shadow-card">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Revisar Emissões</p>
              {revisaoCaixa.length > 3 && (
                <button onClick={() => setModalAberto("revisao")} className="text-[11px] font-semibold text-accent hover:underline">
                  Ver Todos
                </button>
              )}
            </div>
            <p className="text-sm text-gray-400 -mt-0.5 mb-1">Oportunidades de antecipação ou riscos de estouro</p>
            <div className="text-3xl font-extrabold text-text mt-2">{revisaoCaixa.length}</div>
            <p className="text-xs text-text-muted mt-1">
              {formatCurrencyMillions(revisaoCaixa.reduce((a, p) => a + Math.abs(p.aEmitir ?? 0), 0))} em replanejamento
            </p>
            {revisaoCaixa.length > 0 && (
              <div className="mt-3 space-y-1 border-t border-border-subtle pt-2">
                {revisaoCaixa.slice(0, 3).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onSelect(p)}
                    className="w-full flex items-center justify-between gap-2 text-left text-[11px] rounded px-1.5 py-1 hover:bg-card-alt transition-colors"
                  >
                    <span className="text-text truncate">{p.nome}</span>
                    <span className="text-text-muted shrink-0">{formatCurrencyMillions(p.aEmitir)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ProjectListModal
        open={modalAberto === "acao"}
        onClose={() => setModalAberto(null)}
        title="Revisar Empenho — todos"
        projetos={exigemAcao}
        valorFn={(p) => (p.status === "Estouro" ? p.desvioPlurianual : p.aEmitir)}
        justificativaFn={(p) => acaoLabel(p)}
        onSelectProject={(p) => { setModalAberto(null); onSelect(p); }}
      />
      <ProjectListModal
        open={modalAberto === "revisao"}
        onClose={() => setModalAberto(null)}
        title="Revisar Emissões — todos"
        projetos={revisaoCaixa}
        valorFn={(p) => (p.aEmitir === null ? null : Math.abs(p.aEmitir))}
        justificativaFn={() => "Potencial antecipação/postergação entre exercícios"}
        onSelectProject={(p) => { setModalAberto(null); onSelect(p); }}
      />
    </div>
  );
}

function FluxoTooltip({ active, payload, label, colors }: any) {
  if (!active || !payload?.length) return null;
  const planejado = payload.find((p: any) => p.dataKey === "Planejado")?.value;
  const realizado = payload.find((p: any) => p.dataKey === "Realizado")?.value;
  const entry = payload[0]?.payload;
  return (
    <div
      className="rounded-md px-3 py-2 text-xs shadow-card"
      style={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, color: colors.tooltipText }}
    >
      <p className="font-bold mb-1">{label}</p>
      <p>Planejado: {formatCurrencyMillions(planejado)}</p>
      <p>Realizado: {realizado != null ? formatCurrencyMillions(realizado) : "N/D"}</p>
      {entry?.banda && (
        <p className="font-bold mt-1" style={{ color: entry.banda.cor }}>
          {entry.banda.label} ({fmtPct(Math.abs(entry.pct))})
        </p>
      )}
    </div>
  );
}
