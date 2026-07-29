import type { RelatorioParsing } from "../types";

export function ContextBar({ parsed, totalFiltrado, totalGeral, periodoLabel }: {
  parsed: RelatorioParsing;
  totalFiltrado: number;
  totalGeral: number;
  periodoLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted mb-3">
      <div className="flex flex-wrap items-center gap-x-3">
        <span>📅 {parsed.dataBase}</span>
        <span>·</span>
        <span>{totalFiltrado} de {totalGeral} projetos</span>
        <span>·</span>
        <span>Atualizado em {parsed.atualizadoEm}</span>
      </div>
      <span className="rounded-full bg-accent/20 border border-accent/40 text-accent px-3 py-1 font-bold">
        {periodoLabel}
      </span>
    </div>
  );
}
