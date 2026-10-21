import { Card, SectionHeader } from "../../components/ui/primitives";
import { formatCurrencyMillions, fmtBRL } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { AttentionItem, AttentionKind, AttentionSource } from "./types";
/** Milhões sempre com 1 casa decimal ("R$ 5,0M"); abaixo de R$ 1M segue em K. */
function fmtValorAtencao(v: number): string {
  return Math.abs(v) >= 1_000_000 ? formatCurrencyMillions(v) : fmtBRL(v, true);
}


const FAIXA_SINAL: Record<AttentionKind, string> = {
  ACIMA_ORCAMENTO: "bg-warn",
  RCS_EM_RISCO: "bg-crit",
  SALDO_PARADO: "bg-slate-500",
};

const TOOLTIP_PONTOS_ACAO =
  "Vermelho: risco de não virar caixa. Âmbar: comprometido acima do orçamento. Cinza: saldo parado há 6+ meses, pode ser remanejado.";

const ROTA_RISCO_CAIXA = "/risco-caixa";

/** Saldos parados do recorte: total (Σ) e contagem (N) calculados sobre a mesma lista; `top` são os maiores. */
export interface SaldosParadosResumo {
  total: number;
  projetos: number;
  top: AttentionSource[];
}

export function AttentionList({
  itens,
  parados,
  onNavigate,
}: {
  itens: AttentionItem[];
  /** `null` oculta a seção de saldos parados (saldo indisponível ou flag desligada). */
  parados: SaldosParadosResumo | null;
  onNavigate: (href: string) => void;
}) {
  return (
    <Card>
      <SectionHeader title="Pontos de ação" tooltip={TOOLTIP_PONTOS_ACAO} />

      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">OFENSORES DE CAIXA</p>
      {itens.length === 0 ? (
        <p className="mt-1 text-sm text-text-muted">Nada fora do esperado no recorte.</p>
      ) : (
        <ul className="mt-1 divide-y divide-border-subtle">
          {itens.map((it) => (
            <li key={`${it.kind}-${it.projectKey}`}>
              <button
                type="button"
                onClick={() => onNavigate(it.href)}
                title={it.detail}
                className="flex w-full items-stretch gap-3 rounded-md py-0.5 pr-1 text-left hover:bg-card-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                <span aria-hidden className={cn("w-1 shrink-0 rounded-full", FAIXA_SINAL[it.kind])} />
                <span className="min-w-0 flex-1 truncate self-center text-sm font-semibold text-text">
                  {it.projectName}
                </span>
                <span className="shrink-0 self-center text-sm font-semibold tabular-nums text-text">
                  {fmtValorAtencao(it.value)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {parados && (
        <div className="mt-3 border-t border-border-subtle pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            SALDOS PARADOS · {formatCurrencyMillions(parados.total)} EM {parados.projetos} PROJETOS
          </p>
          {parados.top.length === 0 ? (
            <p className="mt-1 text-sm text-text-muted">Nenhum saldo parado no recorte.</p>
          ) : (
            <ul className="mt-1 divide-y divide-border-subtle">
              {parados.top.map((it) => (
                <li key={it.projectKey}>
                  <button
                    type="button"
                    onClick={() => onNavigate(ROTA_RISCO_CAIXA)}
                    title={it.mesesSemCompromisso != null ? `Sem compromisso há ${it.mesesSemCompromisso} meses` : undefined}
                    className="flex w-full items-stretch gap-3 rounded-md py-0.5 pr-1 text-left hover:bg-card-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                  >
                    <span aria-hidden className={cn("w-1 shrink-0 rounded-full", FAIXA_SINAL.SALDO_PARADO)} />
                    <span className="min-w-0 flex-1 truncate self-center text-sm font-semibold text-text">
                      {it.projectName}
                    </span>
                    <span className="shrink-0 self-center text-sm font-semibold tabular-nums text-text">
                      {fmtValorAtencao(it.value)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
