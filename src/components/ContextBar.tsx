import type { RelatorioParsing } from "../types";

export function ContextBar({ parsed, periodoLabel }: {
  parsed: RelatorioParsing;
  periodoLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] mb-3">
      <span className="text-gray-500 dark:text-gray-500">
        Atualizado em {parsed.atualizadoEm}
      </span>
      <span className="rounded-full bg-accent/20 border border-accent/40 text-accent px-3 py-1 font-bold">
        {periodoLabel}
      </span>
    </div>
  );
}
