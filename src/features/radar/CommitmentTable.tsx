import { useCallback, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { CurationUpsertRequest, RcCurationUpsertRequest, RcCurationUpsertResponse, RcView } from "./types";
import { RcRow } from "./RcRow";
import { NUMERIC_COLUMNS, ordenarRcViews, type SortDirection, type SortKey } from "./tableSorting";
import { COMMITMENT_TABLE_WIDTH, CommitmentColGroup, OverflowText } from "./tableLayout";

function SortHeader({ label, sortKey, activeKey, direction, onSort, className = "" }: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey | null;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={`py-2 pr-2 font-semibold ${className}`} aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="inline-flex w-full items-center gap-1 hover:text-text" onClick={() => onSort(sortKey)}>
        <OverflowText text={label} className="min-w-0" />
        <Icon size={12} className="shrink-0" aria-hidden="true" />
      </button>
    </th>
  );
}

interface CommitmentTableProps {
  rcViews: RcView[];
  exerciseYear: number;
  isSaving: (chave: string) => boolean;
  erroDe: (chave: string) => string | null;
  onSalvarRc: (rc: string, payload: RcCurationUpsertRequest) => Promise<RcCurationUpsertResponse | null>;
  onSalvarChave: (chave: string, payload: CurationUpsertRequest) => Promise<boolean>;
}

export function CommitmentTable({ rcViews, exerciseYear, isSaving, erroDe, onSalvarRc, onSalvarChave }: CommitmentTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const rcViewsOrdenadas = useMemo(() => {
    if (!sortKey) return rcViews;
    return ordenarRcViews(rcViews, sortKey, sortDirection);
  }, [rcViews, sortDirection, sortKey]);

  function ordenarPor(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setSortDirection(NUMERIC_COLUMNS.has(key) ? "desc" : "asc");
  }

  const focarProximaRc = useCallback((rcAtual: string) => {
    const container = containerRef.current;
    if (!container) return;
    const linhas = Array.from(container.querySelectorAll<HTMLElement>("[data-rc-key]"));
    const idx = linhas.findIndex((el) => el.dataset.rcKey === rcAtual);
    const proxima = linhas[idx + 1];
    proxima?.querySelector<HTMLInputElement>('[data-role="date-input"]')?.focus();
  }, []);

  if (rcViews.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border py-10 text-center text-sm text-text-muted">
        Nenhuma RC encontrada com os filtros atuais.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="max-w-full overflow-x-auto rounded-card border border-border">
      <table className="commitment-table commitment-grid table-fixed text-xs" style={{ width: COMMITMENT_TABLE_WIDTH }}>
        <CommitmentColGroup />
        <thead>
          <tr className="border-b border-border bg-card-alt text-left text-[11px] uppercase tracking-wide text-text-muted">
            <SortHeader label="RC" sortKey="rc" activeKey={sortKey} direction={sortDirection} onSort={ordenarPor} className="pl-2" />
            <SortHeader label="Fornecedor" sortKey="supplier" activeKey={sortKey} direction={sortDirection} onSort={ordenarPor} />
            <SortHeader label="Ordem de compra" sortKey="purchaseOrder" activeKey={sortKey} direction={sortDirection} onSort={ordenarPor} />
            <SortHeader label="Status compromisso" sortKey="systemStatus" activeKey={sortKey} direction={sortDirection} onSort={ordenarPor} />
            <SortHeader label="Valor" sortKey="value" activeKey={sortKey} direction={sortDirection} onSort={ordenarPor} className="text-right" />
            <SortHeader label="Qtd." sortKey="quantity" activeKey={sortKey} direction={sortDirection} onSort={ordenarPor} className="text-right" />
            <SortHeader label="Entrega" sortKey="delivery" activeKey={sortKey} direction={sortDirection} onSort={ordenarPor} />
            <SortHeader label="Pagto" sortKey="payment" activeKey={sortKey} direction={sortDirection} onSort={ordenarPor} />
            <SortHeader label="Status" sortKey="status" activeKey={sortKey} direction={sortDirection} onSort={ordenarPor} />
            <SortHeader label="Nota" sortKey="notes" activeKey={sortKey} direction={sortDirection} onSort={ordenarPor} />
            <th className="py-2 pr-1 font-semibold w-5" />
          </tr>
        </thead>
        <tbody>
          {rcViewsOrdenadas.map((rc) => (
            <RcRow
              key={rc.rc}
              rcView={rc}
              exerciseYear={exerciseYear}
              isSavingRc={isSaving(`rc:${rc.rc}`)}
              errorRc={erroDe(`rc:${rc.rc}`)}
              isSavingChave={isSaving}
              erroDaChave={erroDe}
              onSalvarRc={onSalvarRc}
              onSalvarChave={onSalvarChave}
              onEnterProximaRc={focarProximaRc}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
