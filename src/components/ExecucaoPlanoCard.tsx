import { useMemo } from "react";
import { fmtPct, formatCurrencyMillions } from "../lib/format";
import { usePctExecucaoPlano, useAEmitirAno } from "../hooks/usePortfolioMetrics";
import type { ProjetoMetricas } from "../types";
import { generateRiskSummary } from "../lib/insights";
import { SegmentedBar } from "./ui/pattern/SegmentedBar";

const BREAKDOWN_COLORS: Record<string, { bg: string; text: string; colorHex: string }> = {
  realizado:   { bg: "bg-emerald-500", text: "text-emerald-900", colorHex: "#10b981" },
  emPagamento: { bg: "bg-amber-500",   text: "text-amber-900",   colorHex: "#f59e0b" },
  emitido:     { bg: "bg-indigo-400",  text: "text-indigo-900",  colorHex: "#818cf8" },
  naoEmitido:  { bg: "bg-slate-500",   text: "text-slate-900",   colorHex: "#64748b" },
};

export function ExecucaoPlanoCard({ lista, noGradient, bare }: { lista: ProjetoMetricas[]; noGradient?: boolean; bare?: boolean }) {
  const pctVsPlano = usePctExecucaoPlano(lista);
  const risco = useMemo(() => generateRiskSummary(lista), [lista]);
  const aEmitirAno = useAEmitirAno(lista);

  const totalRealizadoBreakdown = useMemo(
    () => lista.reduce((a, p) => a + (p.realizadoAcumulado ?? 0), 0),
    [lista]
  );
  const totalEmPagamentoBreakdown = useMemo(
    () => lista.reduce((a, p) => a + ((p.executado ?? 0) - (p.realizadoAcumulado ?? 0)), 0),
    [lista]
  );
  const totalEmitidoBreakdown = useMemo(
    () => lista.reduce((a, p) => a + (p.compromisso ?? 0), 0),
    [lista]
  );
  const totalOrcamentoBreakdown = useMemo(
    () => lista.reduce((a, p) => a + (p.orcamentoPeriodo ?? 0), 0),
    [lista]
  );
  const totalPlanejadoAcumulado = useMemo(
    () => lista.reduce((a, p) => a + (p.planejadoAcumulado ?? 0), 0),
    [lista]
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

    const denominador = Math.max(totalOrcamentoBreakdown, 1);

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
        ? "Caixa N/D"
        : Math.abs(ritmo - 1) <= 0.05
        ? "Caixa dentro da meta"
        : ritmo > 1
        ? "Caixa acima do plano"
        : "Caixa abaixo do plano";
    const pendente = aEmitirAno !== null && aEmitirAno > 0 ? aEmitirAno : risco.emissoesFaltantes.valor;
    const iconCaixa = ritmo !== null && Math.abs(ritmo - 1) <= 0.05 ? "🟢" : "⚠";
    return `${iconCaixa} ${ritmoTexto} · ⚠ ${formatCurrencyMillions(pendente)} pendentes de emissão`;
  }, [aEmitirAno, risco.emissoesFaltantes.valor, totalPlanejadoAcumulado, totalRealizadoBreakdown]);

  const inner = (
    <>
      {pctVsPlano !== null && (
        <div className="w-full">
          <div className="flex items-baseline gap-3 mb-2">
            <p
              aria-label={`${fmtPct(pctVsPlano)} do plano YTD realizado`}
              className={`text-[2.2rem] leading-none font-extrabold tabular-nums ${
                Math.abs(pctVsPlano - 1) <= 0.05
                  ? bare ? "text-ok" : "text-emerald-300"
                  : Math.abs(pctVsPlano - 1) <= 0.15
                  ? bare ? "text-warn" : "text-amber-300"
                  : bare ? "text-crit" : "text-red-300"
              }`}
            >
              {fmtPct(pctVsPlano)}
            </p>
            <p className={`text-[10px] leading-tight ${bare ? "text-text-faint" : "text-white/70"}`}>
              Realizado + Em pgto + Emitido vs. BG
            </p>
          </div>
          <SegmentedBar 
            parts={breakdownSegments.map(seg => ({
              key: seg.key,
              label: seg.label,
              pct: seg.pct,
              color: seg.bg
            }))}
          />
        </div>
      )}
      <div className={`mt-2 flex items-center gap-2 text-[11px] leading-snug ${bare ? "text-text-muted" : "text-white/90"}`}>
        <p className="truncate">{insightLinha}</p>
      </div>
    </>
  );

  if (bare) return <div className="flex flex-col justify-center h-full gap-2">{inner}</div>;

  return (
    <article className={`rounded-card border border-border p-4 shadow-card shrink-0 ${noGradient ? "bg-card text-text" : "bg-gradient-to-r from-slate-900 via-slate-800 to-zinc-800 text-white"}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide mb-2 ${noGradient ? "text-text-muted" : "text-white/75"}`}>Execução do Plano</p>
      {inner}
    </article>
  );
}
