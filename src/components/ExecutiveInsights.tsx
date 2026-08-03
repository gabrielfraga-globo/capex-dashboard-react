import { useMemo } from "react";
import type { KPIEstrategicoCarteira, ProjetoMetricas } from "../types";
import { formatCurrencyMillions } from "../lib/format";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function monthReferenceLabel(date: Date): string {
  const previousMonth = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return `${MONTHS[previousMonth.getMonth()]}/${previousMonth.getFullYear()}`;
}

/**
 * Heurística de Risco: o risco sistêmico primário é o volume represado (a emitir),
 * não o estouro — que pode ser descasamento de apropriação.
 */
function generateRiskNarrative(
  kpis: KPIEstrategicoCarteira[],
  lista: ProjetoMetricas[]
): React.ReactNode {
  const velocidade = kpis.find((k) => k.id === "velocidadeCaixa");
  const referenciaMes = monthReferenceLabel(new Date());

  if (!velocidade || velocidade.status === "nd") {
    return "Sem dados suficientes para avaliar o ritmo de execução neste período.";
  }

  const ritmoTexto =
    velocidade.status === "verde"
      ? "mantém ritmo de execução compatível com o planejado"
      : velocidade.status === "amarelo"
      ? (velocidade.valor !== null && velocidade.valor < 1
          ? "executa ligeiramente abaixo do ritmo planejado"
          : "executa em ritmo ligeiramente acima do planejado")
      : velocidade.valor !== null && velocidade.valor < 1
      ? "executa com ritmo significativamente abaixo do planejado"
      : "executa em patamar acima do planejado";

  // Risco primário: projetos represados (a emitir)
  const represados = lista.filter((p) => p.status === "Risco de Não Realização");
  const valorRepresado = represados.reduce((acc, p) => acc + Math.abs(p.aEmitir ?? 0), 0);

  // Risco secundário: projetos em estouro
  const estouros = lista.filter((p) => p.status === "Estouro");
  const valorEstouro = estouros.reduce((acc, p) => acc + Math.abs(p.desvioPlurianual ?? 0), 0);

  const partes: React.ReactNode[] = [];

  partes.push(`A carteira ${ritmoTexto} em ${referenciaMes}.`);

  if (represados.length > 0) {
    partes.push(
      " O risco sistêmico que ameaça a meta do ano é o montante represado: ",
      <strong key="represado">{formatCurrencyMillions(valorRepresado)}</strong>,
      ` em ${represados.length} projeto${represados.length > 1 ? "s" : ""} com emissão pendente — se não desbloqueados, esse volume compromete diretamente a realização orçamentária.`
    );
  } else {
    partes.push(" Nenhum volume financeiro expressivo está represado neste período.");
  }

  if (estouros.length > 0) {
    partes.push(
      " Adicionalmente, ",
      <strong key="estouro">{formatCurrencyMillions(valorEstouro)}</strong>,
      ` apontam possível estouro em ${estouros.length} projeto${estouros.length > 1 ? "s" : ""} — pode refletir descasamento de apropriação; requer validação antes de qualquer ação corretiva.`
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