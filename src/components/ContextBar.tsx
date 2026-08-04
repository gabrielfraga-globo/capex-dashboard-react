import type { RelatorioParsing } from "../types";

interface ExecutiveInlineSummary {
  caixaStatus: string;
  caixaDescricao: string;
  empenhoStatus: string;
  empenhoDescricao: string;
}

function statusTone(statusLabel: string): string {
  if (/abaixo|requer|atenção|risco|atrasado/i.test(statusLabel)) return "text-amber-600";
  if (/dentro|meta|ideal|ok/i.test(statusLabel)) return "text-emerald-600";
  return "text-gray-500 dark:text-gray-500";
}

export function ContextBar({ parsed, periodoLabel, executiveSummary }: {
  parsed: RelatorioParsing;
  periodoLabel: string;
  executiveSummary?: ExecutiveInlineSummary | null;
}) {
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
          Caixa em <span className={`font-semibold ${statusTone(executiveSummary.caixaStatus)}`}>{executiveSummary.caixaStatus}</span>: {executiveSummary.caixaDescricao} · Empenho em <span className={`font-semibold ${statusTone(executiveSummary.empenhoStatus)}`}>{executiveSummary.empenhoStatus}</span>: {executiveSummary.empenhoDescricao}
        </p>
      )}
    </div>
  );
}
