import { AlertTriangle } from "lucide-react";
import type { SaldoTotals } from "../radar/types";
import { Card, InfoTooltip } from "../../components/ui/primitives";
import { fmtBRL, fmtPct } from "../../lib/format";
import { SALDO_LEGADO_MATERIAL } from "./saldoConfig";
import { buildSaldoBridge, type SaldoBridgeStep } from "./saldo";

const buildBridgePlurianual = (t: SaldoTotals): SaldoBridgeStep[] => [
  { label: "Orçamento plurianual", value: t.orcamento, kind: "base" },
  { label: "Caixa 2026+2027", value: t.caixa, kind: "minus" },
  { label: "Compromisso total", value: t.compromissoTotal, kind: "minus" },
  { label: "Saldo plurianual", value: t.orcamento - t.caixa - t.compromissoTotal, kind: "result" },
  { label: "Saldo potencial 2026 (parado 6m+)", value: t.saldoPotencial, kind: "sub" },
];


const CRITERIO_BI_SALDO =
  "Critério do BI (Saldo Projetos): orçamento BG Gov (BGQ3) − caixa do exercício − compromissos de RCs aprovadas no exercício. " +
  "Difere do KPI 'A emitir', que usa BG Vivo e Compromisso 26. Compromissos de RCs anteriores ao exercício são desconsiderados (premissa).";

const PREFIXO: Record<SaldoBridgeStep["kind"], string> = {
  base: "",
  minus: "−",
  result: "=",
  sub: "└",
};

const ROTULO: Record<string, string> = {
  Orçamento: "Orçamento (BG Gov)",
};

export function SaldoBridge({
  totals,
  exerciseYear,
  hidden = false,
  incluirLegado = false,
  modo = "2026",
}: {
  totals: SaldoTotals;
  exerciseYear: number;
  hidden?: boolean;
  incluirLegado?: boolean;
  modo?: "2026" | "plurianual";
}) {
  if (hidden) {
    return (
      <Card>
        <div className="flex items-start gap-2 text-sm text-risk-critico">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>Conciliação com a carteira não confere. Os valores da ponte estão ocultos até a fonte ser corrigida.</span>
        </div>
      </Card>
    );
  }

  const plurianual = modo === "plurianual";
  const passos: SaldoBridgeStep[] = plurianual
    ? buildBridgePlurianual(totals)
    : buildSaldoBridge(totals, { incluirLegado });
  const orcamento = totals.orcamento;
  const premissaVisivel = !plurianual && !incluirLegado && totals.compromissoLegado >= SALDO_LEGADO_MATERIAL;

  return (
    <Card>
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {plurianual ? "Ponte de saldo · orçamento plurianual" : `Ponte de saldo · exercício ${exerciseYear}`}
      </div>
      <ol className="flex flex-col gap-1.5">
        {passos.map((passo) => {
          const rotulo = ROTULO[passo.label] ?? passo.label;
          const negativoAcima = passo.label === "Saldo disponível" && passo.value < 0;
          const negrito = passo.kind === "result" || passo.kind === "base";
          const pct = orcamento === 0 ? null : passo.value / orcamento;
          return (
            <li
              key={passo.label}
              className={`flex items-baseline justify-between gap-3 text-sm ${passo.kind === "sub" ? "pl-4 text-text-muted" : "text-text"} ${negrito ? "font-semibold" : ""} ${passo.kind === "result" ? "border-t border-border pt-1.5" : ""}`}
            >
              <span className="flex items-center gap-1.5">
                <span className="w-3 text-center font-mono text-text-faint" aria-hidden="true">{PREFIXO[passo.kind]}</span>
                <span>{rotulo}</span>
                {passo.label === "Orçamento" && <InfoTooltip text={CRITERIO_BI_SALDO} />}
              </span>
              <span className="flex items-baseline gap-3 text-right tabular-nums">
                <span className={passo.value < 0 ? "text-risk-critico" : ""}>{fmtBRL(passo.value)}</span>
                <span className="w-14 text-xs text-text-faint">{fmtPct(pct)}</span>
                {negativoAcima && <span className="text-xs text-risk-critico">(acima do orçamento)</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {premissaVisivel && (
        <p className="mt-3 text-xs text-text-muted">
          Premissa: {fmtBRL(totals.compromissoLegado)} em compromissos de RCs aprovadas antes de {exerciseYear} desconsiderados (fora da ponte).
        </p>
      )}
    </Card>
  );
}
