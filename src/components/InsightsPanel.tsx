import { useMemo } from "react";
import type { ProjetoMetricas } from "../types";
import { gerarInsights } from "../lib/insights";
import { Card, SectionHeader } from "./ui/primitives";
import { Lightbulb } from "lucide-react";

export function InsightsPanel({ lista }: { lista: ProjetoMetricas[] }) {
  const insights = useMemo(() => gerarInsights(lista), [lista]);

  if (insights.length === 0) {
    return (
      <Card className="mb-6">
        <SectionHeader title="Insights Automáticos" />
        <p className="text-sm text-text-muted">Sem insights relevantes para os filtros atuais.</p>
      </Card>
    );
  }

  return (
    <div className="mb-6">
      <SectionHeader title="Insights Automáticos" tooltip="Gerados dinamicamente a partir dos dados filtrados — mudam conforme período, plataforma e demais filtros." />
      <div className="grid md:grid-cols-2 gap-3">
        {insights.map((ins, i) => (
          <Card key={i} className="flex gap-3">
            <Lightbulb size={18} className="text-accent shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-text font-medium mb-1">{ins.conclusao}</p>
              <p className="text-text-muted text-xs">
                <b className="text-text">{ins.valor}</b> · {ins.comparacao}
              </p>
              <p className="text-text-faint text-xs mt-1">Impacto: {ins.impacto}</p>
              <p className="text-accent text-xs mt-1 font-medium">→ {ins.acao}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
