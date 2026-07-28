import { useMemo } from "react";
import type { ProjetoMetricas } from "../types";
import { Card, RiskBadge, SectionHeader } from "./ui/primitives";
import { fmtBRL } from "../lib/format";

export function ActionPlan({ lista, onSelect }: { lista: ProjetoMetricas[]; onSelect: (p: ProjetoMetricas) => void }) {
  const grupos = useMemo(() => {
    const map = new Map<string, ProjetoMetricas[]>();
    for (const p of lista) {
      if (p.status === "OK") continue;
      const arr = map.get(p.acaoRecomendada) ?? [];
      arr.push(p);
      map.set(p.acaoRecomendada, arr);
    }
    return Array.from(map.entries())
      .map(([acao, projetos]) => ({
        acao,
        projetos: projetos.sort((a, b) => (b.faltaComprometer ?? b.desvioPlurianual ?? 0) - (a.faltaComprometer ?? a.desvioPlurianual ?? 0)).slice(0, 5),
        total: projetos.length,
      }))
      .sort((a, b) => b.total - a.total);
  }, [lista]);

  if (grupos.length === 0) {
    return (
      <Card className="mb-6">
        <SectionHeader title="Plano de Ação" />
        <p className="text-sm text-text-muted">Nenhuma ação recomendada — carteira filtrada sem riscos identificados.</p>
      </Card>
    );
  }

  return (
    <div className="mb-6">
      <SectionHeader title="Plano de Ação" tooltip="Recomendações derivadas automaticamente da classificação de risco de cada projeto." />
      <div className="grid md:grid-cols-2 gap-3">
        {grupos.map((g) => (
          <Card key={g.acao}>
            <p className="text-sm font-semibold text-text mb-2">{g.acao} <span className="text-text-muted font-normal">({g.total})</span></p>
            <div className="space-y-1.5">
              {g.projetos.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSelect(p)}
                  className="w-full flex items-center justify-between gap-2 text-left text-xs rounded px-2 py-1.5 hover:bg-card-alt/60 transition-colors"
                >
                  <span className="text-text truncate">{p.nome}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-text-muted">{fmtBRL(p.faltaComprometer ?? p.desvioPlurianual ?? 0, true)}</span>
                    <RiskBadge status={p.status} />
                  </span>
                </button>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
