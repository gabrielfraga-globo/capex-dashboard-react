import { useMemo, useState } from "react";
import type { ProjetoMetricas } from "../types";
import { generateDeltaYTD, generateRiskSummary, generateExecutiveInsights } from "../lib/insights";
import { fmtBRL } from "../lib/format";
import { InfoTooltip, RiskBadge } from "./ui/primitives";
import { Search } from "lucide-react";

const STATUS_HERO: Record<string, string> = {
  "Dentro do plano": "bg-risk-baixo/15 text-risk-baixo border-risk-baixo/30",
  "Acompanhar": "bg-risk-medio/15 text-amber-600 border-risk-medio/30",
  "Requer ação": "bg-risk-alto/15 text-risk-alto border-risk-alto/30",
};

/**
 * Radar Executivo — Bento Grid fixo, sem accordion. Tudo visível na 1ª dobra:
 * hero de execução do plano, projetos para decisão, revisão de fluxo, saúde da
 * carteira (3 estados) e insights do ciclo. Nada de matriz de risco, tabelas,
 * memória de cálculo ou informação técnica aqui — isso é só na Auditoria.
 */
export function RadarExecutivo({ lista, onSelect }: { lista: ProjetoMetricas[]; onSelect: (p: ProjetoMetricas) => void }) {
  const [busca, setBusca] = useState("");
  const delta = useMemo(() => generateDeltaYTD(lista), [lista]);
  const risco = useMemo(() => generateRiskSummary(lista), [lista]);
  const insights = useMemo(() => generateExecutiveInsights(lista), [lista]);

  const exigemAcao = useMemo(
    () => lista.filter((p) => p.status === "Estouro" || p.status === "Risco de Não Realização")
      .filter((p) => p.nome.toLowerCase().includes(busca.toLowerCase()))
      .sort((a, b) => b.riscoScore - a.riscoScore),
    [lista, busca]
  );
  const revisaoFluxo = useMemo(
    () => lista.filter((p) => p.status === "Revisão de Fluxo de Caixa")
      .filter((p) => p.nome.toLowerCase().includes(busca.toLowerCase())),
    [lista, busca]
  );

  const acaoLabel = (p: ProjetoMetricas) =>
    p.status === "Estouro" ? "Validar estouro" : "Priorizar emissão";

  const [foco, setFoco] = useState<"todos" | "acao" | "revisao">("todos");
  const mostrarAcao = foco !== "revisao";
  const mostrarRevisao = foco !== "acao";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {([
          { key: "todos", label: "Todos" },
          { key: "acao", label: "Projetos para Ação" },
          { key: "revisao", label: "Revisão de Fluxo" },
        ] as const).map((f) => (
          <button
            key={f.key}
            onClick={() => setFoco(f.key)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
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
            className="w-full rounded-full border border-border bg-card pl-8 pr-3 py-1.5 text-xs text-text placeholder:text-text-faint outline-none focus:border-accent"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card principal grande — Execução do Plano */}
        <div className="lg:col-span-2 lg:row-span-2 rounded-card bg-hero p-6 shadow-card text-white flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/75 mb-1">Execução do Plano</p>
            <span className={`inline-block rounded-full border px-3 py-1 text-xs font-bold bg-white/15 border-white/30 text-white mb-4`}>
              {delta.statusSimples}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] text-white/70">Planejado YTD</p>
              <p className="text-xl font-bold">{fmtBRL(delta.planejadoAcumulado, true)}</p>
            </div>
            <div>
              <p className="text-[11px] text-white/70">Executado YTD</p>
              <p className="text-xl font-bold">{fmtBRL(delta.executadoAcumulado, true)}</p>
            </div>
            <div>
              <p className="text-[11px] text-white/70 flex items-center gap-1">
                Delta YTD
                <span className="[&_.info-icon]:text-white/70 [&_.info-icon:hover]:text-white">
                  <InfoTooltip text="Executado Acumulado − Planejado Acumulado. Negativo é atrás do plano; positivo, à frente." />
                </span>
              </p>
              <p className="text-2xl font-extrabold">{fmtBRL(delta.deltaYTD, true)}</p>
            </div>
          </div>
        </div>

        {/* Saúde da carteira — 3 estados */}
        <div className="rounded-card border border-border bg-card p-5 shadow-card">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Saúde da Carteira</p>
          <div className="space-y-2">
            {(["Dentro do plano", "Acompanhar", "Requer ação"] as const).map((s) => {
              const n = s === "Requer ação" ? risco.nCriticos : s === delta.statusSimples ? 1 : 0;
              const active = s === delta.statusSimples;
              return (
                <div key={s} className={`rounded-lg border px-3 py-2 flex items-center justify-between text-xs font-semibold ${active ? STATUS_HERO[s] : "border-border-subtle text-text-faint"}`}>
                  <span>{s}</span>
                  {s === "Requer ação" && <span>{n}</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Insight do ciclo */}
        <div className="rounded-card border border-border bg-card p-5 shadow-card">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Insight do Ciclo</p>
          <div className="space-y-2">
            {insights.length === 0 ? (
              <p className="text-xs text-text-faint">Sem insights nos filtros atuais.</p>
            ) : (
              insights.slice(0, 4).map((ins, i) => <p key={i} className="text-xs text-text leading-snug">{ins}</p>)
            )}
          </div>
        </div>

        {/* Projetos para decisão */}
        {mostrarAcao && (
        <div className={`${mostrarRevisao ? "lg:col-span-2" : "lg:col-span-3"} rounded-card border border-border bg-card p-5 shadow-card`}>
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

        {/* Revisão de fluxo */}
        {mostrarRevisao && (
        <div className="rounded-card border border-border bg-card p-5 shadow-card">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Revisão de Fluxo</p>
          <div className="text-3xl font-extrabold text-text mt-2">{revisaoFluxo.length}</div>
          <p className="text-xs text-text-muted mt-1">
            {fmtBRL(revisaoFluxo.reduce((a, p) => a + Math.abs(p.aEmitir ?? 0), 0), true)} em ajuste de fluxo
          </p>
          {revisaoFluxo.length > 0 && (
            <div className="mt-3 space-y-1 border-t border-border-subtle pt-2">
              {revisaoFluxo.slice(0, 3).map((p) => (
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
