import { useMemo } from "react";
import type { ProjetoMetricas } from "../types";
import { RiskBadge, KpiCard } from "./ui/primitives";
import { fmtBRL } from "../lib/format";
import { generateRiskSummary, generateTopOffenders, generateExecutiveInsights } from "../lib/insights";

export function Destaques({ lista, onSelect }: { lista: ProjetoMetricas[]; onSelect: (p: ProjetoMetricas) => void }) {
  const risco = useMemo(() => generateRiskSummary(lista), [lista]);
  const ofensores = useMemo(() => generateTopOffenders(lista, 5), [lista]);
  const insights = useMemo(() => generateExecutiveInsights(lista), [lista]);

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <KpiCard
          label="Cobertura Financeira"
          value={risco.coberturaFinanceira !== null ? `${(risco.coberturaFinanceira * 100).toFixed(0)}%` : "–"}
          tooltip="(Executado + Emitido) ÷ Orçamento."
        />
        <KpiCard
          label="Exposição Financeira"
          value={fmtBRL(risco.exposicaoFinanceira, true)}
          tooltip="Valor total em risco de estouro ou não realização."
        />
        <KpiCard
          label="Projetos Críticos"
          value={String(risco.nCriticos)}
          tooltip="Projetos em Estouro ou Risco de Não Realização."
        />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold mb-2">Insights</p>
          <div className="space-y-1.5">
            {insights.length === 0 ? (
              <p className="text-xs text-text-faint">Sem insights nos filtros atuais.</p>
            ) : (
              insights.map((ins, i) => <p key={i} className="text-xs text-text leading-snug">{ins}</p>)
            )}
          </div>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold mb-2">Top 5 Ofensores</p>
          <div className="space-y-1">
            {ofensores.length === 0 ? (
              <p className="text-xs text-text-faint">Nenhum ofensor nos filtros atuais.</p>
            ) : (
              ofensores.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => onSelect(p)}
                  className="w-full flex items-center justify-between gap-2 text-left text-xs rounded px-1.5 py-1 hover:bg-card-alt transition-colors"
                >
                  <span className="text-text truncate">{i + 1}. {p.nome}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-text-muted">{fmtBRL(p.status === "Estouro" ? (p.desvioPlurianual ?? 0) : (p.aEmitir ?? 0), true)}</span>
                    <RiskBadge status={p.status} />
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
