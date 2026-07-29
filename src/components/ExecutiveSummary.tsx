import { useMemo } from "react";
import type { Periodo, ProjetoMetricas } from "../types";
import { KpiCard } from "./ui/primitives";
import { fmtBRL } from "../lib/format";
import { generateExecutiveSummary, generateRiskSummary, generateTopOffenders, generateInsights } from "../lib/insights";
import { RiskBadge } from "./ui/primitives";

const HEALTH_STYLES: Record<string, string> = {
  estouro: "bg-gradient-to-br from-risk-critico to-red-900 text-white",
  baixo: "bg-gradient-to-br from-risk-alto to-orange-800 text-white",
  execucao: "bg-gradient-to-br from-risk-medio to-amber-700 text-amber-950",
  financeiro: "bg-gradient-to-br from-slate-600 to-slate-800 text-white",
};

export function ExecutiveSummary({
  lista,
  periodo,
  onSelect,
}: {
  lista: ProjetoMetricas[];
  periodo: Periodo;
  onSelect: (p: ProjetoMetricas) => void;
}) {
  const resumo = useMemo(() => generateExecutiveSummary(lista), [lista]);
  const risco = useMemo(() => generateRiskSummary(lista), [lista]);
  const ofensores = useMemo(() => generateTopOffenders(lista, 5), [lista]);
  const insights = useMemo(() => generateInsights(lista), [lista]);

  const periodoLabel = { "2026": "2026", "2027": "2027", "Todos": "2026–2027" }[periodo];

  return (
    <div className="mb-5">
      <p className="text-base font-bold text-text mb-4">{resumo.headline}</p>

      {/* Financeiro — 4 KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <KpiCard label={`Orçamento ${periodoLabel}`} value={fmtBRL(resumo.orcamentoPeriodo)} />
        <KpiCard label="Compromisso" value={fmtBRL(resumo.compromisso)} />
        <KpiCard label="Realizado" value={fmtBRL(resumo.executado)} sub={resumo.pctExecucao !== null ? `${(resumo.pctExecucao * 100).toFixed(0)}% executado` : undefined} />
        <KpiCard label="A Emitir" value={fmtBRL(resumo.aEmitir)} />
      </div>

      {/* Saúde da carteira — 4 chips */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className={`rounded-card p-3.5 shadow-card ${HEALTH_STYLES.estouro}`}>
          <div className="text-2xl font-extrabold">{risco.estouro.n}</div>
          <div className="text-[12px] font-bold">🔴 Estouro</div>
        </div>
        <div className={`rounded-card p-3.5 shadow-card ${HEALTH_STYLES.baixo}`}>
          <div className="text-2xl font-extrabold">{risco.baixoComprometimento.n}</div>
          <div className="text-[12px] font-bold">🟠 Baixo Comprometimento</div>
        </div>
        <div className={`rounded-card p-3.5 shadow-card ${HEALTH_STYLES.execucao}`}>
          <div className="text-2xl font-extrabold">{risco.baixaExecucao.n}</div>
          <div className="text-[12px] font-bold">🟡 Baixa Execução</div>
        </div>
        <div className={`rounded-card p-3.5 shadow-card ${HEALTH_STYLES.financeiro}`}>
          <div className="text-xl font-extrabold">{fmtBRL(risco.riscoFinanceiroTotal, true)}</div>
          <div className="text-[12px] font-bold">💰 Risco Financeiro</div>
        </div>
      </div>

      {/* Destaques: Top 5 ofensores + Top 3 insights */}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-card border border-border bg-card p-3.5">
          <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold mb-2">Top 5 Ofensores</p>
          <div className="space-y-1">
            {ofensores.length === 0 ? (
              <p className="text-xs text-text-faint">Nenhum ofensor relevante nos filtros atuais.</p>
            ) : (
              ofensores.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => onSelect(p)}
                  className="w-full flex items-center justify-between gap-2 text-left text-xs rounded px-1.5 py-1 hover:bg-card-alt transition-colors"
                >
                  <span className="text-text truncate">{i + 1}. {p.nome}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-text-muted">{fmtBRL(p.faltaComprometer ?? p.desvioPlurianual ?? 0, true)}</span>
                    <RiskBadge status={p.status} />
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-card border border-border bg-card p-3.5">
          <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold mb-2">Top 3 Insights</p>
          <div className="space-y-1.5">
            {insights.length === 0 ? (
              <p className="text-xs text-text-faint">Sem insights relevantes nos filtros atuais.</p>
            ) : (
              insights.map((ins, i) => (
                <p key={i} className="text-xs text-text leading-snug">{ins}</p>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
