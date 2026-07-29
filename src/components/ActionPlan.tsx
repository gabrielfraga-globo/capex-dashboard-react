import { useMemo } from "react";
import type { ProjetoMetricas } from "../types";
import { generateActionPlan } from "../lib/insights";
import { RiskBadge } from "./ui/primitives";
import { fmtBRL } from "../lib/format";

export function ActionPlan({ lista, onSelect }: { lista: ProjetoMetricas[]; onSelect: (p: ProjetoMetricas) => void }) {
  const grupos = useMemo(() => generateActionPlan(lista), [lista]);

  if (grupos.length === 0) {
    return <p className="text-sm text-text-muted">Nenhuma ação recomendada — carteira filtrada sem riscos identificados.</p>;
  }

  return (
    <div className="grid md:grid-cols-2 gap-3">
      {grupos.map((g) => (
        <div key={g.acao} className="rounded-md border border-border bg-card-alt p-3">
          <p className="text-sm font-semibold text-text mb-2">{g.acao} <span className="text-text-muted font-normal">({g.total})</span></p>
          <div className="space-y-1.5">
            {g.projetos.slice(0, 5).map((p) => (
              <button
                key={p.id}
                onClick={() => onSelect(p)}
                className="w-full flex items-center justify-between gap-2 text-left text-xs rounded px-2 py-1.5 hover:bg-card/60 transition-colors"
              >
                <span className="text-text truncate">{p.nome}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-text-muted">{fmtBRL(p.status === "Estouro" ? (p.desvioPlurianual ?? 0) : (p.aEmitir ?? 0), true)}</span>
                  <RiskBadge status={p.status} />
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
