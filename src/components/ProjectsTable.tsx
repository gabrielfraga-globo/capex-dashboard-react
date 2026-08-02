import { useState } from "react";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel,
  flexRender, createColumnHelper, type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, Download, ChevronLeft, ChevronRight } from "lucide-react";
import type { ProjetoMetricas } from "../types";
import { RiskBadge, Button } from "./ui/primitives";
import { EmptyState } from "./ui/EmptyState";
import { fmtBRL, fmtPct } from "../lib/format";

const columnHelper = createColumnHelper<ProjetoMetricas>();

const columns = [
  columnHelper.accessor("nome", { header: "Projeto" }),
  columnHelper.accessor("n4Curta", { header: "Plataforma" }),
  columnHelper.accessor("gestor", { header: "Gestor", cell: (i) => i.getValue() ?? "—" }),
  columnHelper.accessor("aprovador", { header: "1º Aprovador", cell: (i) => i.getValue() ?? "—" }),
  columnHelper.accessor("orcamentoPeriodo", { header: "Orçamento Período", cell: (i) => fmtBRL(i.getValue()) }),
  columnHelper.accessor("orcamentoPlurianual", { header: "Orçamento Plurianual", cell: (i) => fmtBRL(i.getValue()) }),
  columnHelper.accessor("realizado2026", { header: "Realizado", cell: (i) => fmtBRL(i.getValue()) }),
  columnHelper.accessor("emPagamento2026", { header: "Em Pagamento", cell: (i) => fmtBRL(i.getValue()) }),
  columnHelper.accessor("executado", { header: "Executado", cell: (i) => fmtBRL(i.getValue()) }),
  columnHelper.accessor("compromisso", { header: "Emitido", cell: (i) => fmtBRL(i.getValue()) }),
  columnHelper.accessor("aEmitir", { header: "A Emitir", cell: (i) => fmtBRL(i.getValue()) }),
  columnHelper.accessor("pctExecucao", { header: "% Execução", cell: (i) => fmtPct(i.getValue()) }),
  columnHelper.accessor("pctComprometimento", { header: "% Emitido", cell: (i) => fmtPct(i.getValue()) }),
  columnHelper.accessor("coberturaFinanceira", { header: "Cobertura Financeira", cell: (i) => fmtPct(i.getValue()) }),
  columnHelper.accessor("desvioPlurianual", { header: "Desvio Plurianual", cell: (i) => fmtBRL(i.getValue()) }),
  columnHelper.accessor("participacaoRisco", { header: "Participação no Risco", cell: (i) => fmtPct(i.getValue()) }),
  columnHelper.accessor("status", { header: "Status", cell: (i) => <RiskBadge status={i.getValue()} /> }),
  columnHelper.accessor("acaoRecomendada", { header: "Ação Recomendada" }),
];

function toCsv(rows: ProjetoMetricas[]): string {
  const headers = [
    "Projeto", "Plataforma", "Gestor", "1º Aprovador", "Orçamento Período", "Orçamento Plurianual",
    "Realizado", "Em Pagamento", "Executado", "Emitido", "A Emitir",
    "% Execução", "% Emitido", "Cobertura Financeira", "Desvio Plurianual", "Participação no Risco", "Status", "Ação Recomendada",
  ];
  const lines = rows.map((p) =>
    [
      p.nome, p.n4Curta, p.gestor ?? "", p.aprovador ?? "",
      p.orcamentoPeriodo ?? "", p.orcamentoPlurianual ?? "", p.realizado2026 ?? "", p.emPagamento2026 ?? "",
      p.executado ?? "", p.compromisso ?? "", p.aEmitir ?? "",
      p.pctExecucao !== null ? (p.pctExecucao * 100).toFixed(1) : "", p.pctComprometimento !== null ? (p.pctComprometimento * 100).toFixed(1) : "",
      p.coberturaFinanceira !== null ? (p.coberturaFinanceira * 100).toFixed(1) : "",
      p.desvioPlurianual ?? "", p.participacaoRisco !== null ? (p.participacaoRisco * 100).toFixed(1) : "",
      p.status, p.acaoRecomendada,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(";")
  );
  return [headers.join(";"), ...lines].join("\n");
}

export function ProjectsTable({ lista, onSelect }: { lista: ProjetoMetricas[]; onSelect: (p: ProjetoMetricas) => void }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "aEmitir", desc: true }]);
  const [pageSize, setPageSize] = useState(10);

  const table = useReactTable({
    data: lista,
    columns,
    state: { sorting, pagination: { pageIndex: 0, pageSize } },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const exportCsv = () => {
    const csv = toCsv(lista);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `carteira_capex_filtrada_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = () => navigator.clipboard.writeText(toCsv(lista));

  if (lista.length === 0) {
    return <EmptyState description="Nenhum projeto corresponde aos filtros aplicados na tabela." />;
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-3 gap-2">
        <Button variant="outline" onClick={copyToClipboard} className="text-xs">Copiar</Button>
        <Button variant="default" onClick={exportCsv} className="flex items-center gap-1 text-xs">
          <Download size={13} /> Exportar CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border">
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left font-semibold uppercase tracking-wide text-text-muted hover:text-accent"
                  >
                    <span className="flex items-center gap-1">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      <ArrowUpDown size={11} />
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onSelect(row.original)}
                className={`border-b border-border-subtle hover:bg-card-alt/60 cursor-pointer ${
                  row.original.status === "Estouro" ? "bg-risk-critico/10" : ""
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="whitespace-nowrap px-3 py-2 text-text">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <span>Registros por página:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded border border-border bg-card-alt px-2 py-1 text-text"
            >
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span>· {lista.length} projetos no total</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Página anterior"
              className="disabled:opacity-30 rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span>Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount() || 1}</span>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Próxima página"
              className="disabled:opacity-30 rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
