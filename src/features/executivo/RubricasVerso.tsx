import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, LabelList } from "recharts";
import { Card, InfoTooltip } from "../../components/ui/primitives";
import { fmtMilhoes } from "../../lib/format";
import { mesesDecorridos } from "../../lib/metrics";
import { getChartColors, chartTooltipStyle } from "../../lib/chartColors";
import { useThemeStore } from "../../store/themeStore";
import { chaveRubrica, resumoPorRubrica, type ResumoRubrica } from "../../domain/rubricaPlanejadoRealizado";
import type { ProjetoBase } from "../../types";
import type { OperationalRow } from "../radar/operational";

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const CORES_POR_RUBRICA: Record<string, string> = {
  SOLUCAO: "#1d4ed8",
  MDO: "#60a5fa",
  INSTALACAO: "#bfdbfe",
  RESERVA: "#64748b",
};
const COR_RUBRICA_PADRAO = "#9AA3B2";
/** Cores claras pedem rótulo escuro para manter contraste. */
const CORES_CLARAS = new Set(["#60a5fa", "#bfdbfe"]);
const LIMITE_ROTULO_PCT = 8;
/** Abaixo disso o planejado é pequeno demais para o desvio carregar sinal de cor. */
const LIMITE_RUBRICA_PEQUENA = 1_000_000;

const chaveSegmento = (rubrica: string) => `r_${rubrica.replace(/[^A-Za-z0-9]/g, "_")}`;

const corDaRubrica = (rubrica: string) => CORES_POR_RUBRICA[chaveRubrica(rubrica)] ?? COR_RUBRICA_PADRAO;

const fmtPct0 = (v: number) => `${Math.round(v)}%`;

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

  // Cada coluna é uma base de 100%: a participação de cada rubrica no total da coluna.
  const dados = useMemo(() => {
    const colunas = [
      { categoria: rotuloPlanejado, chave: "planejado" as const },
      { categoria: "Realizado", chave: "realizado" as const },
      { categoria: "Comprometido", chave: "comprometido" as const },
    ];
    return colunas.map(({ categoria, chave }) => {
      const total = resumo.reduce((a, r) => a + r[chave], 0);
      const linha: Record<string, string | number> = { categoria };
      for (const r of resumo) {
        const valor = r[chave];
        linha[chaveSegmento(r.rubrica)] = total > 0 ? (valor / total) * 100 : 0;
        linha[`${chaveSegmento(r.rubrica)}__valor`] = valor;
      }
      return linha;
    });
  }, [resumo, rotuloPlanejado]);

  const legenda = resumo.map((r) => ({ rubrica: r.rubrica, cor: corDaRubrica(r.rubrica), item: r }));

  return (
    <Card className="flex h-full min-h-0 flex-col gap-2 overflow-hidden p-4">
      <div data-flip-title tabIndex={-1} className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-text outline-none">
        <span className="min-w-0 truncate uppercase tracking-wide">Planejado × realizado por rubrica</span>
        <InfoTooltip
          label="Sobre planejado × realizado por rubrica"
          text="Planejado: orçamento mensal somado até o mês anterior (mesmo corte do Fluxo de caixa). Realizado: valor pago. Comprometido: emitido elegível da premissa simples. Barras 100% por rubrica; a medida principal é Realizado / Planejado."
        />
      </div>

      {legenda.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted" aria-label="Legenda das rubricas">
          {legenda.map(({ rubrica, cor }) => (
            <li key={rubrica} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: cor }} aria-hidden="true" />
              <span>{rubrica}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="min-h-0 flex-1">
        {resumo.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-text-muted">Sem rubricas no recorte atual.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <XAxis dataKey="categoria" tick={{ fill: colors.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                {...tooltipStyle}
                cursor={{ fill: "transparent" }}
                formatter={(value, _name, item) => {
                  const chave = String(item.dataKey ?? "");
                  const valor = Number(item.payload?.[`${chave}__valor`] ?? 0);
                  const rotulo = legenda.find((l) => chaveSegmento(l.rubrica) === chave)?.rubrica ?? chave;
                  return [`${fmtMilhoes(valor)} (${fmtPct0(Number(value))})`, rotulo];
                }}
              />
              {resumo.map((r) => {
                const cor = corDaRubrica(r.rubrica);
                return (
                  <Bar key={r.rubrica} dataKey={chaveSegmento(r.rubrica)} stackId="a" fill={cor} isAnimationActive={false}>
                    <LabelList
                      dataKey={chaveSegmento(r.rubrica)}
                      position="center"
                      formatter={(v: unknown) => (typeof v === "number" && v >= LIMITE_ROTULO_PCT ? fmtPct0(v) : "")}
                      style={{ fill: CORES_CLARAS.has(cor) ? "#0f172a" : "#FFFFFF", fontSize: 11, fontWeight: 600 }}
                    />
                  </Bar>
                );
              })}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <ul className="flex flex-col gap-1 text-xs">
        {legenda.map(({ rubrica, cor, item }) => (
          <LinhaRubrica key={rubrica} r={item} cor={cor} />
        ))}
      </ul>
    </Card>
  );
}

function LinhaRubrica({ r, cor }: { r: ResumoRubrica; cor: string }) {
  const razao = r.planejado > 0 ? r.realizado / r.planejado : null;
  const pequena = r.planejado < LIMITE_RUBRICA_PEQUENA;
  return (
    <li className="flex min-w-0 items-center gap-2 py-0">
      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: cor }} aria-hidden="true" />
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
