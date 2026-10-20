import { fmtBRL } from "../../lib/format";
import { opcoesRubricaVisiveis } from "../../lib/rubrica";
import { cn } from "../../lib/utils";
import type { SaldoRecorteView } from "../radar/types";
import { saldoTotalDe } from "./saldo";

function fmtComSinal(v: number): string {
  const sinal = v < 0 ? "−" : v > 0 ? "+" : "";
  return `${sinal}${fmtBRL(Math.abs(v), true)}`;
}

export function RubricaChips({
  views,
  selected,
  onToggle,
}: {
  views: SaldoRecorteView[];
  selected: string[];
  onToggle: (rubrica: string) => void;
}) {
  const visiveis = new Set(opcoesRubricaVisiveis(views.map((v) => v.key)));
  const ordenadas = views.filter((v) => visiveis.has(v.key)).sort((a, b) => saldoTotalDe(a) - saldoTotalDe(b));

  return (
    <div className="flex flex-wrap gap-2">
      {ordenadas.map((v) => {
        const total = saldoTotalDe(v);
        const isSelected = selected.includes(v.key);
        return (
          <button
            key={v.key}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onToggle(v.key)}
            title={`${v.key}: ${fmtBRL(total)}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs transition-colors",
              "hover:bg-card-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
              isSelected ? "border-accent border-2 font-semibold text-text" : "border-border text-text-muted"
            )}
          >
            <span>{v.key}</span>
            <span className={cn("tabular-nums", total < 0 && "text-risk-critico font-semibold")}>
              {fmtComSinal(total)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
