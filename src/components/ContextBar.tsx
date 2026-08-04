import type { RelatorioParsing } from "../types";
import { formatCurrencyMillions } from "../lib/format";

interface ExecutiveInlineSummary {
  caixaStatus: string;
  caixaStatusCode: "verde" | "amarelo" | "vermelho" | "nd";
  caixaValor: number | null;
  empenhoStatus: string;
  pendenteEmissao: number | null;
}

export function ContextBar({ parsed, periodoLabel, executiveSummary }: {
  parsed: RelatorioParsing;
  periodoLabel: string;
  executiveSummary?: ExecutiveInlineSummary | null;
}) {
  const resumoCurto = (() => {
    if (!executiveSummary) return "";
    const { caixaStatusCode, caixaValor, pendenteEmissao } = executiveSummary;
    const ritmoTexto =
      caixaStatusCode === "nd" || caixaValor === null
        ? "Ritmo de caixa N/D"
        : caixaStatusCode === "verde"
        ? "Ritmo de caixa ok"
        : caixaValor >= 1
        ? "Ritmo de caixa acima do plano"
        : "Ritmo de caixa abaixo do plano";

    const pendenteTexto =
      pendenteEmissao !== null && pendenteEmissao > 0
        ? `${formatCurrencyMillions(pendenteEmissao)} pendentes de emissão`
        : "pendências de emissão N/D";

    return `${ritmoTexto} · Pontos de atenção: ${pendenteTexto}`;
  })();

  return (
    <div className="mb-3 text-[11px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-gray-500 dark:text-gray-500">
          Atualizado em {parsed.atualizadoEm}
        </span>
        <span className="rounded-full bg-accent/20 border border-accent/40 text-accent px-3 py-1 font-bold">
          {periodoLabel}
        </span>
      </div>
      {executiveSummary && (
        <p className="mt-1 text-gray-500 dark:text-gray-500 leading-4">
          {resumoCurto}
        </p>
      )}
    </div>
  );
}
