import type { ReactNode } from "react";
import type { RelatorioParsing } from "../types";

export function ContextBar({ parsed, periodoLabel, acoes, className = "mb-3" }: {
  parsed: RelatorioParsing;
  periodoLabel: string;
  /** Controles à direita da linha, antes do rótulo de período (ex.: Filtros na Visão Diretoria). */
  acoes?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${className} text-[11px]`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-gray-500 dark:text-gray-500">
          Atualizado em {parsed.atualizadoEm}
        </span>
        <div className="flex items-center gap-2">
          {acoes}
          <span className="rounded-full bg-accent/20 border border-accent/40 text-accent px-3 py-1 font-bold">
            {periodoLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
