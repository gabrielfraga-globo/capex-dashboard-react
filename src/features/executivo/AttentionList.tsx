import { Card, SectionHeader } from "../../components/ui/primitives";
import { fmtBRL } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { AttentionItem, AttentionKind } from "./types";

const MARCADOR: Record<AttentionKind, { char: string; className: string }> = {
  ACIMA_ORCAMENTO: { char: "●", className: "text-risk-critico" },
  RCS_EM_RISCO: { char: "●", className: "text-risk-medio" },
  SALDO_PARADO: { char: "○", className: "text-text-muted" },
};

export function AttentionList({
  itens,
  onNavigate,
}: {
  itens: AttentionItem[];
  onNavigate: (href: string) => void;
}) {
  return (
    <Card>
      <SectionHeader title="O que merece atenção" />
      {itens.length === 0 ? (
        <p className="text-sm text-text-muted">Nada fora do esperado no recorte.</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {itens.map((it) => {
            const m = MARCADOR[it.kind];
            return (
              <li key={`${it.kind}-${it.projectKey}`}>
                <button
                  type="button"
                  onClick={() => onNavigate(it.href)}
                  className="flex w-full items-center gap-3 rounded-md py-2 text-left hover:bg-card-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  <span aria-hidden className={cn("text-xs", m.className)}>
                    {m.char}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-text" title={it.projectName}>
                      {it.projectName}
                    </span>
                    <span className="block text-xs text-text-muted">{it.detail}</span>
                    {it.owner && <span className="block text-[11px] text-text-faint">{it.owner}</span>}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-text" title={fmtBRL(it.value)}>
                    {fmtBRL(it.value, true)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={() => onNavigate("/risco-caixa")}
        className="mt-3 text-sm font-medium text-accent hover:underline"
      >
        Ver risco de caixa →
      </button>
    </Card>
  );
}
