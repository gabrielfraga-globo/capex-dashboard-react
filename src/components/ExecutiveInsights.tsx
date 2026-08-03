import { useMemo } from "react";
import type { KPIEstrategicoCarteira, ProjetoMetricas } from "../types";
import { formatCurrencyMillions } from "../lib/format";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function monthReferenceLabel(date: Date): string {
  const previousMonth = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return `${MONTHS[previousMonth.getMonth()]}/${previousMonth.getFullYear()}`;
}

/**
 * Narrativa executiva direta: ritmo + risco primário (represados) + risco secundário (estouros).
 * Tom: objetivo, sem adjetivos desnecessários.
 */
function generateRiskNarrative(
  kpis: KPIEstrategicoCarteira[],
  lista: ProjetoMetricas[]
): React.ReactNode {
  const ritmoKpi = kpis.find((k) => k.id === "velocidadeCaixa");
  const referenciaMes = monthReferenceLabel(new Date());

  if (!ritmoKpi || ritmoKpi.status === "nd") {
    return "Sem dados suficientes para avaliar o ritmo de execução neste período.";
  }

  const ritmoTexto =
    ritmoKpi.status === "verde"
      ? "compatível com o plano"
      : ritmoKpi.status === "amarelo"
      ? ritmoKpi.valor !== null && ritmoKpi.valor < 1
        ? "ligeiramente abaixo do planejado"
        : "ligeiramente acima do planejado"
      : ritmoKpi.valor !== null && ritmoKpi.valor < 1
      ? "significativamente abaixo do planejado"
      : "acima do planejado";

  const represados = lista.filter((p) => p.status === "Risco de Não Realização");
  const valorRepresado = represados.reduce((acc, p) => acc + Math.abs(p.aEmitir ?? 0), 0);

  const estouros = lista.filter((p) => p.status === "Estouro");
  const valorEstouro = estouros.reduce((acc, p) => acc + Math.abs(p.desvioPlurianual ?? 0), 0);

  const partes: React.ReactNode[] = [];

  partes.push(`Ritmo de execução ${ritmoTexto} em ${referenciaMes}.`);

  if (represados.length > 0) {
    partes.push(
      " Atenção: ",
      <strong key="represado">{formatCurrencyMillions(valorRepresado)}</strong>,
      ` represados em ${represados.length} projeto${represados.length > 1 ? "s" : ""} aguardam emissão e travam a meta.`
    );
  }

  if (estouros.length > 0) {
    partes.push(
      " Secundariamente, ",
      <strong key="estouro">{formatCurrencyMillions(valorEstouro)}</strong>,
      ` apontam possível descasamento em ${estouros.length} projeto${estouros.length > 1 ? "s" : ""}, exigindo validação prévia.`
    );
  }

  return partes;
}

export function ExecutiveInsights({
  kpis,
  lista,
}: {
  kpis: KPIEstrategicoCarteira[];
  lista: ProjetoMetricas[];
}) {
  const narrativa = useMemo(() => generateRiskNarrative(kpis, lista), [kpis, lista]);

  return (
    <p className="mb-4 text-sm leading-relaxed text-muted-foreground" aria-live="polite">
      {narrativa}
    </p>
  );
}