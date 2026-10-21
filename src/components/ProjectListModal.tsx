import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMemo, useState, type ReactNode } from "react";
import { X, Search, ArrowUpDown } from "lucide-react";
import type { ProjetoMetricas } from "../types";
import { RiskBadge } from "./ui/primitives";
import { formatCurrencyMillions } from "../lib/format";

export interface ColunaProjetoLista {
  header: string;
  valor: (p: ProjetoMetricas) => ReactNode;
  alinhar?: "right";
}

export function ProjectListModal({
  open,
  onClose,
  title,
  projetos,
  valorFn,
  justificativaFn,
  onSelectProject,
  colunas,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  projetos: ProjetoMetricas[];
  valorFn: (p: ProjetoMetricas) => number | null;
  justificativaFn?: (p: ProjetoMetricas) => string;
  onSelectProject: (p: ProjetoMetricas) => void;
  /** Quando informado, substitui o valor/badge padrão por uma célula por coluna após o nome. */
  colunas?: ColunaProjetoLista[];
}) {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<"desc" | "asc">("desc");

  const lista = useMemo(() => {
    const filtrados = projetos.filter((p) => p.nome.toLowerCase().includes(busca.toLowerCase()));
    const sortVal = (v: number | null) => (v === null || Number.isNaN(v) ? Number.NEGATIVE_INFINITY : v);
    return filtrados.sort((a, b) => {
      const aVal = sortVal(valorFn(a));
      const bVal = sortVal(valorFn(b));
      return ordem === "desc" ? bVal - aVal : aVal - bVal;
    });
  }, [projetos, busca, ordem, valorFn]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-xl max-h-[80vh] rounded-card border border-border bg-card shadow-card flex flex-col focus:outline-none">
          <div className="flex items-center justify-between p-4 border-b border-border-subtle">
            <DialogPrimitive.Title className="text-sm font-bold text-text">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <button className="text-text-muted hover:text-text rounded p-1" aria-label="Fechar">
                <X size={18} />
              </button>
            </DialogPrimitive.Close>
          </div>

          <div className="flex items-center gap-2 p-3 border-b border-border-subtle">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar projeto…"
                className="w-full rounded-full border border-border bg-card-alt pl-8 pr-3 py-1.5 text-xs text-text placeholder:text-text-faint outline-none focus:border-accent"
              />
            </div>
            <button
              onClick={() => setOrdem((o) => (o === "desc" ? "asc" : "desc"))}
              className="flex items-center gap-1 rounded-full border border-border bg-card-alt px-3 py-1.5 text-xs text-text-muted hover:text-text shrink-0"
            >
              <ArrowUpDown size={12} /> {ordem === "desc" ? "Maior → Menor" : "Menor → Maior"}
            </button>
          </div>

          <div className="overflow-y-auto p-2 space-y-1">
            {colunas && lista.length > 0 && (
              <div
                className="grid items-center gap-2 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-faint"
                style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${colunas.length}, auto)` }}
              >
                <span>Projeto</span>
                {colunas.map((c) => (
                  <span key={c.header} className={c.alinhar === "right" ? "text-right" : undefined}>
                    {c.header}
                  </span>
                ))}
              </div>
            )}
            {lista.length === 0 ? (
              <p className="text-xs text-text-faint p-4 text-center">Nenhum projeto encontrado.</p>
            ) : (
              lista.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSelectProject(p)}
                  className={
                    colunas
                      ? "w-full grid items-center gap-2 text-left text-xs rounded-lg px-3 py-2.5 hover:bg-card-alt transition-colors border border-transparent hover:border-border"
                      : "w-full flex items-center justify-between gap-2 text-left text-xs rounded-lg px-3 py-2.5 hover:bg-card-alt transition-colors border border-transparent hover:border-border"
                  }
                  style={colunas ? { gridTemplateColumns: `minmax(0,1fr) repeat(${colunas.length}, auto)` } : undefined}
                >
                  <div className={colunas ? "min-w-0" : "flex-1 min-w-0"}>
                    <p className="text-text truncate font-medium">{p.nome}</p>
                    {justificativaFn && <p className="text-text-faint text-[11px] truncate mt-0.5">{justificativaFn(p)}</p>}
                  </div>
                  {colunas ? (
                    colunas.map((c) => (
                      <span
                        key={c.header}
                        className={`text-text-muted font-semibold whitespace-nowrap ${c.alinhar === "right" ? "text-right" : ""}`}
                      >
                        {c.valor(p)}
                      </span>
                    ))
                  ) : (
                    <>
                      <span className="text-text-muted font-semibold shrink-0">{formatCurrencyMillions(valorFn(p))}</span>
                      <RiskBadge status={p.status} />
                    </>
                  )}
                </button>
              ))
            )}
          </div>
          <div className="p-2 border-t border-border-subtle text-[11px] text-text-faint text-center">
            {lista.length} projeto(s)
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
