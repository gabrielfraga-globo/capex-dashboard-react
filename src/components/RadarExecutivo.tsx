import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";
import type { ProjetoMetricas } from "../types";
import { useFilterStore } from "../store/filterStore";
import { useThemeStore } from "../store/themeStore";
import { getChartColors } from "../lib/chartColors";
import { generateDeltaYTD, generateRadarInsights } from "../lib/insights";
import { fmtBRL } from "../lib/format";
import { InfoTooltip, RiskBadge } from "./ui/primitives";
import { Search, SlidersHorizontal, ChevronRight } from "lucide-react";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MES_ATUAL = new Date().getMonth() + 1;

const SAUDE_STYLE: Record<string, string> = {
  "Dentro do Plano": "bg-risk-baixo/10 border-risk-baixo/30 text-risk-baixo",
  "Acompanhar": "bg-risk-medio/10 border-risk-medio/30 text-amber-600",
  "Requer Ação": "bg-risk-alto/10 border-risk-alto/30 text-risk-alto",
};

/**
 * Radar Executivo — Bento Grid fixo. Primeira dobra com só 5 blocos: Hero, Execução
 * do Plano (com gráfico e insights embutidos), Saúde da Carteira, Projetos para
 * Decisão, Revisar Caixa do Ano. Filtros escondidos por padrão atrás de um botão.
 */
export function RadarExecutivo({ lista, onSelect }: { lista: ProjetoMetricas[]; onSelect: (p: ProjetoMetricas) => void }) {
  const filtros = useFilterStore();
  const { theme } = useThemeStore();
  const colors = getChartColors(theme);
  const [busca, setBusca] = useState("");
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [foco, setFoco] = useState<"todos" | "acao" | "revisao">("todos");

  const delta = useMemo(() => generateDeltaYTD(lista), [lista]);
  const insights = useMemo(() => generateRadarInsights(lista, delta), [lista, delta]);

  const exigemAcao = useMemo(
    () => lista.filter((p) => p.status === "Estouro" || p.status === "Risco de Não Realização")
      .filter((p) => p.nome.toLowerCase().includes(busca.toLowerCase()))
      .sort((a, b) => b.riscoScore - a.riscoScore),
    [lista, busca]
  );
  const revisaoCaixa = useMemo(
    () => lista.filter((p) => p.status === "Revisão de Caixa").filter((p) => p.nome.toLowerCase().includes(busca.toLowerCase())),
    [lista, busca]
  );

  // Saúde da carteira: 3 baldes reais (projetos + valor), não um número solto.
  const saude = useMemo(() => {
    const normal = lista.filter((p) => p.status === "Normal");
    const acompanhar = lista.filter((p) => p.status === "Revisão de Caixa");
    const acao = lista.filter((p) => p.status === "Estouro" || p.status === "Risco de Não Realização");
    const sum = (arr: ProjetoMetricas[]) => arr.reduce((a, p) => a + (p.orcamentoPeriodo ?? 0), 0);
    return {
      "Dentro do Plano": { n: normal.length, valor: sum(normal) },
      "Acompanhar": { n: acompanhar.length, valor: sum(acompanhar) },
      "Requer Ação": { n: acao.length, valor: sum(acao) },
    };
  }, [lista]);

  // Gráfico Planejado × Realizado acumulado — mensal (dado real de Planejado; Realizado
  // é uma reta entre o início do ano e o total acumulado conhecido até o mês corrente,
  // já que a fonte não guarda o realizado mês a mês).
  const fluxoData = useMemo(() => {
    const planejadoMensal = Array(12).fill(0);
    for (const p of lista) {
      if (!p.meses2026) continue;
      p.meses2026.forEach((v, i) => { planejadoMensal[i] += v; });
    }
    let acumulado = 0;
    const totalRealizado = delta.executadoAcumulado;
    return MESES.map((m, i) => {
      acumulado += planejadoMensal[i];
      const realizado = i + 1 <= MES_ATUAL ? (totalRealizado * (i + 1)) / MES_ATUAL : null;
      return { mes: m, Planejado: Math.round(acumulado), Realizado: realizado !== null ? Math.round(realizado) : null };
    });
  }, [lista, delta.executadoAcumulado]);

  const acaoLabel = (p: ProjetoMetricas) => (p.status === "Estouro" ? "Validar estouro" : "Priorizar emissão");
  const mostrarAcao = foco !== "revisao";
  const mostrarRevisao = foco !== "acao";

  return (
    <div>
      {/* Filtros — escondidos por padrão */}
      <div className="mb-4">
        <button
          onClick={() => setMostrarFiltros((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text"
        >
          <SlidersHorizontal size={13} /> Filtros
        </button>
        {mostrarFiltros && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2.5">
            {(["2026", "2027", "Todos"] as const).map((p) => (
              <button
                key={p}
                onClick={() => filtros.setPeriodo(p)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                  filtros.periodo === p ? "bg-accent text-white" : "bg-card-alt text-text-muted hover:text-text"
                }`}
              >
                {p === "Todos" ? "Todos os anos" : p}
              </button>
            ))}
            {([
              { key: "todos", label: "Todos" },
              { key: "acao", label: "Projetos para Ação" },
              { key: "revisao", label: "Revisão de Caixa" },
            ] as const).map((f) => (
              <button
                key={f.key}
                onClick={() => setFoco(f.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
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
                className="w-full rounded-full border border-border bg-card-alt pl-8 pr-3 py-1.5 text-xs text-text placeholder:text-text-faint outline-none focus:border-accent"
              />
            </div>
          </div>
        )}
      </div>

      {/* Hero Executivo — 1 linha */}
      <p className="text-base font-bold text-text mb-4">{delta.headline}</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Execução do Plano — card grande: números + gráfico + insights */}
        <div className="lg:col-span-2 lg:row-span-2 rounded-card bg-hero p-6 shadow-card text-white flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/75">Execução do Plano</p>
            <span className="inline-block rounded-full border px-3 py-1 text-xs font-bold bg-white/15 border-white/30 text-white">
              {delta.statusSimples}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-[11px] text-white/70">Planejado YTD</p>
              <p className="text-lg font-bold">{fmtBRL(delta.planejadoAcumulado, true)}</p>
            </div>
            <div>
              <p className="text-[11px] text-white/70">Executado YTD</p>
              <p className="text-lg font-bold">{fmtBRL(delta.executadoAcumulado, true)}</p>
            </div>
            <div>
              <p className="text-[11px] text-white/70 flex items-center gap-1">
                Delta YTD
                <span className="[&_.info-icon]:text-white/70 [&_.info-icon:hover]:text-white">
                  <InfoTooltip text="Executado Acumulado − Planejado Acumulado. Negativo é atrás do plano; positivo, à frente." />
                </span>
              </p>
              <p className="text-xl font-extrabold">{fmtBRL(delta.deltaYTD, true)}</p>
            </div>
          </div>

          <div className="bg-white/10 rounded-xl p-2 mb-4">
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={fluxoData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <XAxis dataKey="mes" stroke="rgba(255,255,255,.6)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v: any) => fmtBRL(Number(v))}
                  contentStyle={{ background: colors.tooltipBg, border: "none", borderRadius: 8, fontSize: 11 }}
                  labelStyle={{ color: colors.tooltipLabel }}
                />
                <Legend wrapperStyle={{ fontSize: 10, color: "rgba(255,255,255,.85)" }} />
                <Line type="monotone" dataKey="Planejado" stroke="rgba(255,255,255,.85)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Realizado" stroke="#FFFFFF" strokeWidth={2.5} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1 mt-auto">
            {insights.map((ins, i) => (
              <p key={i} className="text-xs text-white/90 leading-snug">• {ins}</p>
            ))}
          </div>
        </div>

        {/* Saúde da carteira — 3 estados, com projetos + valor, clicável */}
        <div className="rounded-card border border-border bg-card p-5 shadow-card">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Saúde da Carteira</p>
          <div className="space-y-2">
            {(["Dentro do Plano", "Acompanhar", "Requer Ação"] as const).map((s) => {
              const b = saude[s];
              return (
                <button
                  key={s}
                  onClick={() => setFoco(s === "Requer Ação" ? "acao" : s === "Acompanhar" ? "revisao" : "todos")}
                  className={`w-full rounded-lg border px-3 py-2 flex items-center justify-between text-xs ${SAUDE_STYLE[s]} hover:brightness-110 transition-all`}
                >
                  <span className="font-semibold">{s}</span>
                  <span className="flex items-center gap-2">
                    <span>{b.n} proj.</span>
                    <span className="font-bold">{fmtBRL(b.valor, true)}</span>
                    <ChevronRight size={12} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Projetos para decisão */}
        {mostrarAcao && (
          <div className={`${mostrarRevisao ? "" : "lg:col-span-1"} rounded-card border border-border bg-card p-5 shadow-card`}>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Projetos para Decisão</p>
            {exigemAcao.length === 0 ? (
              <p className="text-xs text-text-faint">Nenhum projeto exige decisão nos filtros atuais.</p>
            ) : (
              <div className="space-y-1.5">
                {exigemAcao.slice(0, 5).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onSelect(p)}
                    className="w-full flex items-center justify-between gap-2 text-left text-xs rounded-lg px-2.5 py-2 hover:bg-card-alt transition-colors border border-transparent hover:border-border"
                  >
                    <span className="text-text truncate flex-1">{p.nome}</span>
                    <span className="text-text-muted shrink-0">{fmtBRL(p.status === "Estouro" ? (p.desvioPlurianual ?? 0) : (p.aEmitir ?? 0), true)}</span>
                    <span className="text-accent font-semibold shrink-0">{acaoLabel(p)}</span>
                    <RiskBadge status={p.status} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Revisar caixa do ano */}
        {mostrarRevisao && (
          <div className="rounded-card border border-border bg-card p-5 shadow-card">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Revisar Caixa do Ano</p>
            <div className="text-3xl font-extrabold text-text mt-2">{revisaoCaixa.length}</div>
            <p className="text-xs text-text-muted mt-1">
              {fmtBRL(revisaoCaixa.reduce((a, p) => a + Math.abs(p.aEmitir ?? 0), 0), true)} em replanejamento
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
                    <span className="text-text-muted shrink-0">{fmtBRL(p.aEmitir, true)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
