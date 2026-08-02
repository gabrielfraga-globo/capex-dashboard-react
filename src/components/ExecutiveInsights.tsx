import { useMemo } from "react";
import type { KPIEstrategicoCarteira, StatusSemaforo } from "../types";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function monthReferenceLabel(date: Date): string {
  const previousMonth = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return `${MONTHS[previousMonth.getMonth()]}/${previousMonth.getFullYear()}`;
}

/**
 * Gera uma narrativa executiva fluida baseada nas descrições dos 3 KPIs.
 * Exemplo de saída:
 * "A carteira executa dentro do ritmo planejado para Jul/2026.
 * O orçamento comprometido atingiu 65% do limite anual.
 * Não foi possível calcular a cobertura futura de execução para o período atual."
 */
function generateFluidNarrative(kpis: KPIEstrategicoCarteira[]): string {
  const kpiById = new Map<KPIEstrategicoCarteira["id"], KPIEstrategicoCarteira>();
  for (const kpi of kpis) kpiById.set(kpi.id, kpi);

  const velocidade = kpiById.get("velocidadeCaixa");
  const empenho = kpiById.get("empenho");
  const equilibrio = kpiById.get("equilibrioFinanceiro");

  const referenciaMes = monthReferenceLabel(new Date());

  // Constrói frases com base nas descrições executivas (que já vêm textualizadas e em português)
  const frases: string[] = [];

  if (velocidade) {
    // Primeira frase: contexto de período + status de velocidade
    frases.push(`A carteira executa com ${velocidade.descricaoExecutiva.toLowerCase().replace(/\.$/g, "")} para ${referenciaMes}.`);
  }

  if (empenho) {
    // Segunda frase: status de empenho
    frases.push(`Quanto ao empenho, ${empenho.descricaoExecutiva.toLowerCase().replace(/\.$/g, "")}.`);
  }

  if (equilibrio) {
    // Terceira frase: status de equilíbrio
    frases.push(`Em termos de cobertura, ${equilibrio.descricaoExecutiva.toLowerCase().replace(/\.$/g, "")}.`);
  }

  return frases.join(" ");
}

export function ExecutiveInsights({ kpis }: { kpis: KPIEstrategicoCarteira[] }) {
  const narrativa = useMemo(() => generateFluidNarrative(kpis), [kpis]);

  // Cores de status para destaque na narrativa
  const hasVerde = kpis.some((k) => k.status === "verde");
  const hasAmarelo = kpis.some((k) => k.status === "amarelo");
  const hasVermelho = kpis.some((k) => k.status === "vermelho");

  const accentColor = hasVermelho ? "text-red-600" : hasAmarelo ? "text-amber-600" : "text-emerald-600";

  return (
    <p className={`mb-4 text-sm leading-relaxed ${accentColor} font-medium`} aria-live="polite">
      {narrativa}
    </p>
  );
}