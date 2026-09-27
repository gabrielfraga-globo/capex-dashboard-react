import { useMemo } from "react";
import { fmtPct, formatCurrencyMillions } from "../lib/format";
import { usePctExecucaoPlano, useAEmitirAno } from "../hooks/usePortfolioMetrics";
import type { ProjetoMetricas } from "../types";
import { generateRiskSummary } from "../lib/insights";

const BREAKDOWN_COLORS: Record<string, { bg: string; text: string; colorHex: string }> = {
  realizado:   { bg: "bg-emerald-500", text: "text-emerald-900", colorHex: "#10b981" },
  emPagamento: { bg: "bg-amber-500",   text: "text-amber-900",   colorHex: "#f59e0b" },
  emitido:     { bg: "bg-indigo-400",  text: "text-indigo-900",  colorHex: "#818cf8" },
  naoEmitido:  { bg: "bg-slate-500",   text: "text-slate-900",   colorHex: "#64748b" },
};

export function ExecucaoPlanoCard({ lista }: { lista: ProjetoMetricas[] }) {
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

  return (
    <article className="rounded-card border border-border bg-gradient-to-r from-slate-900 via-slate-800 to-zinc-800 p-4 text-white shadow-card shrink-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/75 mb-2">Execução do Plano</p>

      {pctVsPlano !== null && (
        <div className="flex flex-row items-center justify-between w-full gap-4">
          <div className="shrink-0 grid grid-cols-2 gap-4 min-w-[270px]">
            <div>
              <p
                aria-label={`${fmtPct(pctVsPlano)} do plano YTD realizado`}
                className={`text-[2.8rem] leading-none font-extrabold tabular-nums ${
                  Math.abs(pctVsPlano - 1) <= 0.05
                    ? "text-emerald-300"
                    : Math.abs(pctVsPlano - 1) <= 0.15
                    ? "text-amber-300"
                    : "text-red-300"
                }`}
              >
                {fmtPct(pctVsPlano)}
              </p>
              <p className="text-[10px] text-white/70 mt-1 leading-tight">
                Provisionado = Realizado + Em pgto + Emitido
              </p>
            </div>
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
        <p className="truncate">{insightLinha}</p>
      </div>
    </article>
  );
}
