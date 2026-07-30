import { useMemo } from "react";
import type { Periodo, ProjetoMetricas } from "../types";
import { KpiCard } from "./ui/primitives";
import { fmtBRL } from "../lib/format";
import { generateExecutiveSummary } from "../lib/insights";

/**
 * Primeira dobra — responde só 5 perguntas: quanto de orçamento, quanto executado,
 * quanto emitido, quanto resta emitir, e a saúde geral (1 frase). Tudo mais fica em
 * seções recolhíveis (ver App.tsx).
 */
export function ExecutiveSummary({ lista, periodo }: { lista: ProjetoMetricas[]; periodo: Periodo }) {
  const resumo = useMemo(() => generateExecutiveSummary(lista), [lista]);
  const periodoLabel = { "2026": "2026", "2027": "2027", "Todos": "2026–2027" }[periodo];

  return (
    <div className="mb-5">
      <p className="text-base font-bold text-text mb-3">{resumo.headline}</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label={`Orçamento ${periodoLabel}`}
          value={fmtBRL(resumo.orcamentoPeriodo)}
          tooltip="Valor total aprovado para o período selecionado."
        />
        <KpiCard
          label="Executado"
          value={fmtBRL(resumo.executado)}
          tooltip="Valor já pago ou reconhecido como gasto (Realizado + Em Pagamento)."
        />
        <KpiCard
          label="Emitido"
          value={fmtBRL(resumo.compromisso)}
          tooltip="Valor já formalizado em contrato ou pedido de compra."
        />
        <KpiCard
          label="A Emitir"
          value={fmtBRL(resumo.aEmitir)}
          tooltip="Parcela do orçamento que ainda não entrou no fluxo financeiro. Orçamento − Executado − Emitido."
        />
      </div>
    </div>
  );
}
