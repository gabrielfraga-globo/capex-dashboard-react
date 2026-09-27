import { useMemo } from "react";
import { ComposedChart, Area, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { fmtPct, formatCurrencyMillions } from "../lib/format";
import type { ProjetoMetricas } from "../types";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

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
  ) {
    return null;
  }
  return parsed;
}

function getMonthNamePt(monthIndex: number): string {
  return ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"][monthIndex] ?? "Mês";
}

function bandaDelta(pctAbs: number): { cor: string; label: string } {
  if (pctAbs <= 0.05) return { cor: "#2A9D6F", label: "Dentro do Plano" };
  if (pctAbs <= 0.15) return { cor: "#E0B429", label: "Acompanhar" };
  return { cor: "#C0392B", label: "Requer Ação" };
}

type FluxoEntry = {
  mes: string;
  Planejado: number;
  Realizado: number | null;
  planejadoAcumulado: number;
  realizadoAcumulado: number | null;
  realizadoAcumuladoSolido: number | null;
  realizadoAcumuladoTracejado: number | null;
  baseGapPositivo: number | null;
  gapPositivo: number | null;
  baseGapNegativo: number | null;
  gapNegativo: number | null;
  pct: number | null;
  banda: { cor: string; label: string } | null;
  isPartialMonth: boolean;
  dataBase?: string | null;
};

function CustomTooltipFluxo({ active, payload, label, compact }: { active?: boolean; payload?: Array<{ payload: FluxoEntry }>; label?: string, compact?: boolean }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  
  if (compact) {
    return (
      <div className="rounded-lg border border-border bg-white/95 p-2 shadow-lg text-xs min-w-[150px] dark:bg-zinc-900/95">
        <p className="font-bold text-text mb-1">{label}</p>
        <p className="text-violet-300">Plan: {formatCurrencyMillions(d.planejadoAcumulado)}</p>
        {d.realizadoAcumulado !== null && (
          <p style={{ color: d.banda?.cor ?? '#8B7FE8' }}>
            Real: {formatCurrencyMillions(d.realizadoAcumulado)}
          </p>
        )}
      </div>
    );
  }

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
      {d.isPartialMonth && d.dataBase && (
        <p className="mt-2 text-[10px] font-medium text-amber-700 dark:text-amber-300">
          Mês em andamento — dados até {d.dataBase}
        </p>
      )}
    </div>
  );
}

export function FluxoCaixaChart({
  lista,
  dataBase,
  isLoadingCompromisso,
  compact,
  bare,
}: {
  lista: ProjetoMetricas[];
  dataBase?: string | null;
  isLoadingCompromisso?: boolean;
  compact?: boolean;
  /** Remove o card wrapper e o cabeçalho interno. */
  bare?: boolean;
}) {
  const temFluxoReal = useMemo(() => lista.some((p) => p.executadoMensal2026 !== null), [lista]);

  const ultimoMesComDadoIdx = useMemo(() => {
    return lista.reduce((maxIndex, projeto) => {
      const arr = projeto.executadoMensal2026 ?? [];
      for (let i = arr.length - 1; i >= 0; i -= 1) {
        if (arr[i] !== 0) return Math.max(maxIndex, i);
      }
      return maxIndex;
    }, -1);
  }, [lista]);

  const partialMonthInfo = useMemo(() => {
    if (!dataBase) return null;
    const baseDate = parseDateBR(dataBase);
    if (!baseDate) return null;
    const mesIdx = baseDate.getMonth();
    const ultimoDia = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).getDate();
    const isClosedMonth = baseDate.getDate() >= ultimoDia;
    if (isClosedMonth) return null;

    if (ultimoMesComDadoIdx !== mesIdx) return null;

    return {
      monthIndex: mesIdx,
      label: MESES[mesIdx],
      fullLabel: getMonthNamePt(mesIdx),
      dataBase: dataBase,
    };
  }, [dataBase, ultimoMesComDadoIdx]);

  const fluxoData = useMemo(() => {
    const canonicalRealizado = lista.reduce((a, p) => a + (p.realizadoAcumulado ?? 0), 0);
    const planejadoMensal = Array(12).fill(0);
    const realizadoMensalArr = Array(12).fill(0);
    for (const p of lista) {
      if (p.meses2026) p.meses2026.forEach((v, i) => { planejadoMensal[i] += v; });
      if (p.executadoMensal2026) p.executadoMensal2026.forEach((v, i) => { realizadoMensalArr[i] += v; });
    }

    const lastIdx = ultimoMesComDadoIdx;
    if (lastIdx >= 0 && temFluxoReal) {
      const sumReal = realizadoMensalArr.slice(0, lastIdx + 1).reduce((a, b) => a + b, 0);
      realizadoMensalArr[lastIdx] += canonicalRealizado - sumReal;
    }

    let sumPlanejado = 0;
    let sumRealizado = 0;

    return MESES.map((m, i) => {
      const temExecEsteMes = i <= ultimoMesComDadoIdx;
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
      const realizadoAcumulado = realizado !== null ? sumRealizado : null;
      const isPartialMonth = partialMonthInfo?.monthIndex === i;
      
      const partialIdx = partialMonthInfo?.monthIndex ?? null;
      const ultimoFechadoIdx = partialIdx !== null ? partialIdx - 1 : null;
      const isSolidPoint = realizadoAcumulado !== null && (partialIdx === null || i <= (ultimoFechadoIdx ?? -1));
      const isDashedPoint = realizadoAcumulado !== null && partialIdx !== null && (i === partialIdx || i === ultimoFechadoIdx);
      
      return {
        mes: m,
        Planejado: planejado,
        Realizado: realizado,
        planejadoAcumulado: sumPlanejado,
        realizadoAcumulado,
        realizadoAcumuladoSolido: isSolidPoint ? realizadoAcumulado : null,
        realizadoAcumuladoTracejado: isDashedPoint ? realizadoAcumulado : null,
        baseGapPositivo, gapPositivo, baseGapNegativo, gapNegativo,
        pct, banda, isPartialMonth, dataBase: partialMonthInfo?.dataBase ?? dataBase,
      };
    });
  }, [dataBase, lista, partialMonthInfo, temFluxoReal, ultimoMesComDadoIdx]);

  const chartContent = (
    <>
      {temFluxoReal ? (
        <div className="flex-1 min-h-0 relative">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={fluxoData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="areaPlanejado" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={compact ? "rgba(161, 161, 170, 0.3)" : "#3B82F6"} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={compact ? "rgba(161, 161, 170, 0.3)" : "#3B82F6"} stopOpacity={0.07} />
                </linearGradient>
                <linearGradient id="areaRealizado" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={compact ? "#7C8CF8" : "#10B981"} stopOpacity={0.33} />
                  <stop offset="100%" stopColor={compact ? "#7C8CF8" : "#10B981"} stopOpacity={0.08} />
                </linearGradient>
              </defs>

              <XAxis dataKey="mes" stroke="rgba(82,82,91,0.9)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis
                domain={["auto", "auto"]}
                stroke="rgba(82,82,91,0.9)"
                tick={{ fill: "rgba(82,82,91,0.9)", fontSize: 11, fontWeight: 600 }}
                tickLine={false}
                axisLine={false}
                width={compact ? 58 : 48}
                tickFormatter={(v) => formatCurrencyMillions(Number(v ?? 0)).replace("R$ ", "")}
              />
              <Tooltip content={<CustomTooltipFluxo compact={compact} />} cursor={{ stroke: "rgba(82,82,91,0.25)", strokeWidth: 1 }} />

              {!compact && (
                <>
                  <Area type="monotone" dataKey="baseGapPositivo" stackId="gapPos" stroke="none" fill="transparent" isAnimationActive={false} connectNulls={false} />
                  <Area type="monotone" dataKey="gapPositivo" stackId="gapPos" stroke="none" fill="rgba(37, 99, 235, 0.24)" isAnimationActive={false} connectNulls={false} />
                  <Area type="monotone" dataKey="baseGapNegativo" stackId="gapNeg" stroke="none" fill="transparent" isAnimationActive={false} connectNulls={false} />
                  <Area type="monotone" dataKey="gapNegativo" stackId="gapNeg" stroke="none" fill="rgba(5, 150, 105, 0.22)" isAnimationActive={false} connectNulls={false} />
                </>
              )}

              <Area
                type="monotone"
                dataKey="planejadoAcumulado"
                name="Planejado (acum.)"
                stroke={compact ? "#a1a1aa" : "#2563EB"}
                strokeWidth={2.2}
                fill="url(#areaPlanejado)"
                dot={false}
                activeDot={!compact ? { r: 3, fill: "#2563EB" } : false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="planejadoAcumulado"
                stroke={compact ? "#a1a1aa" : "#2563EB"}
                strokeWidth={2.2}
                strokeDasharray={compact ? "4 4" : undefined}
                dot={false}
                activeDot={false}
                legendType="none"
              />

              <Area
                type="monotone"
                dataKey="realizadoAcumulado"
                name="Realizado (acum.)"
                stroke="none"
                fill="url(#areaRealizado)"
                dot={false}
                activeDot={!compact ? { r: 3, fill: "#059669" } : false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="realizadoAcumuladoSolido"
                stroke={compact ? "#7C8CF8" : "#059669"}
                strokeWidth={2.4}
                dot={false}
                activeDot={false}
                connectNulls={false}
                legendType="none"
              />
              {partialMonthInfo && (
                <Line
                  type="monotone"
                  dataKey="realizadoAcumuladoTracejado"
                  stroke={compact ? "#7C8CF8" : "#059669"}
                  strokeWidth={2.4}
                  strokeDasharray="6 5"
                  dot={false}
                  activeDot={!compact ? { r: 3, fill: "#059669" } : false}
                  connectNulls={false}
                  legendType="none"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          {!compact && partialMonthInfo && (
            <p className="mt-1 text-[11px] text-text-muted">
              {partialMonthInfo.fullLabel} parcial — dados até {partialMonthInfo.dataBase}
            </p>
          )}
        </div>
      ) : isLoadingCompromisso ? (
        <div role="status" aria-label="Carregando gráfico de fluxo…" className="flex-1 min-h-0 w-full rounded-lg bg-card-alt animate-pulse mt-2" />
      ) : (
        <div className="flex-1 min-h-0 flex items-center justify-center text-center px-6">
          <p className="text-xs text-text-muted leading-snug">
            Sem dado mensal real de Executado nesta planilha (aba "Realizado detalhado" ausente).
          </p>
        </div>
      )}
    </>
  );

  if (bare) {
    return <div className="flex flex-col h-full min-h-0 flex-1">{chartContent}</div>;
  }

  return (
    <article className={`rounded-card border border-border bg-card p-3 shadow-card flex-1 min-h-0 flex flex-col ${compact ? "h-full" : ""}`}>
      {!compact && (
        <div className="flex items-start justify-between gap-3 mb-2 shrink-0">
          <div>
            <p className="text-sm font-semibold text-text">Fluxo de Caixa: Planejado × Realizado</p>
          </div>
        </div>
      )}
      {compact && (
        <div className="flex items-center justify-between mb-1 shrink-0">
          <p className="text-[12px] font-semibold text-text">Planejado x Realizado</p>
          <div className="flex gap-2 text-[10px] font-medium">
            <span className="flex items-center gap-1 text-text-muted"><span className="w-2 h-0 border-b border-dashed border-text-muted"></span> Plan</span>
            <span className="flex items-center gap-1 text-info"><span className="w-2 h-1 bg-info rounded-sm"></span> Real</span>
          </div>
        </div>
      )}
      {chartContent}
    </article>
  );
}
