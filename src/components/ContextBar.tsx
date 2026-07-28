import type { FiltrosState, RelatorioParsing } from "../types";

export function ContextBar({ parsed, filtros, totalFiltrado, totalGeral }: {
  parsed: RelatorioParsing;
  filtros: FiltrosState;
  totalFiltrado: number;
  totalGeral: number;
}) {
  const periodoLabel = { "2026": "Orçamento 2026", "2027": "Orçamento 2027", "Todos": "Orçamento consolidado 2026–2027" }[filtros.periodo];

  const chips: string[] = [];
  if (filtros.plataforma) chips.push(`Plataforma: ${filtros.plataforma}`);
  if (filtros.gestor) chips.push(`Gestor: ${filtros.gestor}`);
  if (filtros.aprovador) chips.push(`Aprovador: ${filtros.aprovador}`);
  if (filtros.projeto) chips.push(`Projeto: ${filtros.projeto}`);
  if (filtros.status) chips.push(`Status: ${filtros.status}`);
  if (filtros.busca) chips.push(`Busca: "${filtros.busca}"`);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted mb-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>📅 Data-base: <b className="text-text">{parsed.dataBase}</b></span>
        <span>🗂️ Escopo: <b className="text-text">Plataformas de Produção</b></span>
        <span>📄 Arquivo: <b className="text-text">{parsed.nomeArquivo}</b></span>
        <span>🕐 Atualizado em: <b className="text-text">{parsed.atualizadoEm}</b></span>
        <span>📊 Exibindo <b className="text-text">{totalFiltrado}</b> de <b className="text-text">{totalGeral}</b> projetos</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-accent/20 border border-accent/40 text-accent px-3 py-1 font-bold">
          {periodoLabel}
        </span>
        {chips.map((c) => (
          <span key={c} className="rounded-full bg-card-alt border border-border px-2.5 py-1">{c}</span>
        ))}
      </div>
    </div>
  );
}
