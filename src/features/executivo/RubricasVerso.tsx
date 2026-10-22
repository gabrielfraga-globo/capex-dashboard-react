import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, LabelList } from "recharts";
import { Card, InfoTooltip } from "../../components/ui/primitives";
import { fmtMilhoes } from "../../lib/format";
import { mesesDecorridos } from "../../lib/metrics";
import { getChartColors, chartTooltipStyle } from "../../lib/chartColors";
import { useThemeStore } from "../../store/themeStore";
import { resumoPorRubrica, type ResumoRubrica } from "../../domain/rubricaPlanejadoRealizado";
import type { ProjetoBase } from "../../types";
import type { OperationalRow } from "../radar/operational";

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
/** Cores dos status do fluxo: planejado cinza, realizado azul forte, comprometido azul claro. */
const COR_PLANEJADO = "#94a3b8";
const COR_REALIZADO = "#2563eb";
const COR_COMPROMETIDO = "#bfdbfe";
/** Abaixo disso o planejado é pequeno demais para o desvio carregar sinal de cor. */
const LIMITE_RUBRICA_PEQUENA = 1_000_000;

function classeDesvio(razao: number | null): string {
  if (razao === null) return "text-text-muted";
  if (razao > 1.1) return "text-warn";
  if (razao < 0.9) return "text-crit";
  return "text-text";
}

export function RubricasVerso({
  projetos,
  linhas,
  rubricas,
}: {
  projetos: ProjetoBase[];
  linhas: OperationalRow[];
  rubricas: readonly string[];
}) {
  const { theme } = useThemeStore();
  const colors = getChartColors(theme);
  const tooltipStyle = chartTooltipStyle(theme);

  const n = mesesDecorridos(2026, 12);
  const rotuloPlanejado = n > 0 ? `Planejado até ${MESES_CURTOS[n - 1]}` : "Planejado";

  const resumo = useMemo(
    () => resumoPorRubrica({ projetos, linhas, rubricas, mesesPlanejados: n }),
    [projetos, linhas, rubricas, n]
  );

  // Eixo X = rubricas; cada rubrica tem uma coluna por status do fluxo. Rubricas zeradas saem do gráfico.
  const dados = useMemo(
    () =>
      resumo
        .filter((r) => r.planejado > 0 || r.realizado > 0 || r.comprometido > 0)
        .map((r) => ({
          categoria: r.rubrica,
          planejado: r.planejado,
          realizado: r.realizado,
          comprometido: r.comprometido,
        })),
    [resumo]
  );

  const legenda = resumo.map((r) => ({ rubrica: r.rubrica, item: r }));
  const statusLegenda = [
    { chave: "planejado", rotulo: rotuloPlanejado, cor: COR_PLANEJADO },
    { chave: "realizado", rotulo: "Realizado", cor: COR_REALIZADO },
    { chave: "comprometido", rotulo: "Comprometido", cor: COR_COMPROMETIDO },
  ] as const;

  return (
    <Card className="flex h-full min-h-0 flex-col gap-2 overflow-hidden p-4">
      <div data-flip-title tabIndex={-1} className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-text outline-none">
        <span className="min-w-0 truncate uppercase tracking-wide">Planejado × realizado por rubrica</span>
        <InfoTooltip
          label="Sobre planejado × realizado por rubrica"
          text="Planejado: orçamento mensal somado até o mês anterior (mesmo corte do Fluxo de caixa). Realizado: valor pago. Comprometido: emitido elegível da premissa simples. Barras 100% por rubrica; a medida principal é Realizado / Planejado."
        />
      </div>

      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted" aria-label="Legenda do status do fluxo">
        {statusLegenda.map(({ chave, rotulo, cor }) => (
          <li key={chave} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: cor }} aria-hidden="true" />
            <span>{rotulo}</span>
          </li>
        ))}
      </ul>

      <div className="min-h-0 flex-1">
        {dados.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-text-muted">Sem rubricas no recorte atual.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} margin={{ top: 16, right: 8, bottom: 0, left: 8 }} barGap={2}>
              <XAxis dataKey="categoria" tick={{ fill: colors.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                {...tooltipStyle}
                cursor={{ fill: "transparent" }}
                formatter={(value, name) => [fmtMilhoes(Number(value)), String(name)]}
              />
              {statusLegenda.map(({ chave, rotulo, cor }) => (
                <Bar key={chave} dataKey={chave} name={rotulo} fill={cor} isAnimationActive={false}>
                  <LabelList
                    dataKey={chave}
                    position="top"
                    formatter={(v: unknown) => (typeof v === "number" && v > 0 ? fmtMilhoes(v) : "")}
                    style={{ fill: colors.axis, fontSize: 10, fontWeight: 600 }}
                  />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <ul className="flex flex-col gap-1 text-xs">
        {legenda.map(({ rubrica, item }) => (
          <LinhaRubrica key={rubrica} r={item} />
        ))}
      </ul>
    </Card>
  );
}

function LinhaRubrica({ r }: { r: ResumoRubrica }) {
  const razao = r.planejado > 0 ? r.realizado / r.planejado : null;
  const pequena = r.planejado < LIMITE_RUBRICA_PEQUENA;
  return (
    <li className="flex min-w-0 items-center gap-2 py-0">
      <span className="min-w-0 flex-1 truncate text-text">{r.rubrica}</span>
      <span className="shrink-0 whitespace-nowrap text-text-muted tabular-nums">
        {fmtMilhoes(r.realizado)} / {fmtMilhoes(r.planejado)}
      </span>
      <span
        className={`w-12 shrink-0 text-right font-semibold tabular-nums ${pequena ? "text-text" : classeDesvio(razao)}`}
        title={pequena ? "Valor pequeno, sem sinal" : undefined}
      >
        {razao === null ? "—" : `${Math.round(razao * 100)}%`}
      </span>
    </li>
  );
}
