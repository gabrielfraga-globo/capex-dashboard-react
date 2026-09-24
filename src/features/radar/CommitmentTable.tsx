import { useCallback, useRef } from "react";
import type { CurationUpsertRequest, RcCurationUpsertRequest, RcCurationUpsertResponse, RcView } from "./types";
import { RcRow } from "./RcRow";

interface CommitmentTableProps {
  rcViews: RcView[];
  isSaving: (chave: string) => boolean;
  erroDe: (chave: string) => string | null;
  onSalvarRc: (rc: string, payload: RcCurationUpsertRequest) => Promise<RcCurationUpsertResponse | null>;
  onSalvarChave: (chave: string, payload: CurationUpsertRequest) => Promise<boolean>;
}

export function CommitmentTable({ rcViews, isSaving, erroDe, onSalvarRc, onSalvarChave }: CommitmentTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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
    <div ref={containerRef} className="overflow-x-auto rounded-card border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-card-alt text-left text-[11px] uppercase tracking-wide text-text-muted">
            <th className="py-2 pl-2 pr-2 font-semibold">RC</th>
            <th className="py-2 pr-2 font-semibold text-right">Valor</th>
            <th className="py-2 pr-2 font-semibold">Entrega</th>
            <th className="py-2 pr-2 font-semibold">Pagto</th>
            <th className="py-2 pr-2 font-semibold">Status</th>
            <th className="py-2 pr-2 font-semibold">Nota</th>
            <th className="py-2 pr-1 font-semibold w-5" />
          </tr>
        </thead>
        <tbody>
          {rcViews.map((rc) => (
            <RcRow
              key={rc.rc}
              rcView={rc}
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
