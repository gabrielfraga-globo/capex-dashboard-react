import { fmtBRL, fmtPct } from "../../../lib/format";

interface BarListRow {
  dot?: boolean;
  label: string;
  value: number; // For the proportional bar
  count?: number;
  pct?: number; // 0..1
  color: string; // valid tailwind class, e.g., 'bg-ok'
  isOther?: boolean;
}

interface BarListProps {
  rows: BarListRow[];
  totalValue?: number;
  totalLabel?: string;
  totalCount?: number;
  showTotalPct?: boolean;
}

export function BarList({ rows, totalValue, totalLabel = "Total", totalCount, showTotalPct }: BarListProps) {
  const maxVal = rows.length > 0 ? Math.max(...rows.map(r => r.value), 1) : 1;

  // Decide columns based on what's provided
  const hasCount = rows.some(r => r.count !== undefined);
  const hasPct = rows.some(r => r.pct !== undefined);
  
  // Grid layout
  let gridCols = "minmax(0, 140px) 1fr";
  if (hasCount && !hasPct) gridCols = "minmax(0, 120px) 1fr auto auto"; 
  else if (!hasCount && hasPct) gridCols = "minmax(0, 180px) 1fr 70px 40px"; 
  else if (hasCount && hasPct) gridCols = "minmax(0, 140px) 1fr auto auto auto";

  return (
    <div className="flex flex-col justify-around flex-1 min-h-0 gap-3">
      {rows.map((r, i) => (
        <div
          key={i}
          className="grid items-center gap-x-3 text-[13px]"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {r.dot && <span className={`w-2 h-2 rounded-full shrink-0 ${r.color}`} />}
            <span className={`truncate ${r.isOther ? "text-text-faint" : "text-text-muted"}`} title={r.label}>
              {r.label}
            </span>
          </div>
          <div className="relative h-[6px] rounded bg-border overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 rounded ${r.color}`}
              style={{ width: `${Math.round((r.value / maxVal) * 100)}%`, opacity: r.isOther ? 0.3 : 1 }}
            />
          </div>
          {hasCount && (
            <span className="font-semibold tabular-nums text-text text-right">{r.count}</span>
          )}
          <span className={`tabular-nums text-right text-[12px] ${!hasCount ? "text-text" : "text-text-muted"}`}>
            {fmtBRL(r.value, true)}
          </span>
          {hasPct && (
            <span className="tabular-nums text-text-muted text-right text-[12px]">
              {r.pct !== undefined ? fmtPct(r.pct) : ""}
            </span>
          )}
        </div>
      ))}
      
      {(totalValue !== undefined || totalCount !== undefined) && (
        <div 
          className="pt-2 mt-1 border-t border-border grid items-center gap-x-3 text-[12px] font-semibold text-text" 
          style={{ gridTemplateColumns: gridCols }}
        >
          <span>{totalLabel}</span>
          <span />
          {hasCount && (
            <span className="text-right">{totalCount} {totalCount !== undefined ? "projetos" : ""}</span>
          )}
          {totalValue !== undefined && !hasCount && (
            <span className="text-right tabular-nums">{fmtBRL(totalValue, true)}</span>
          )}
          {totalValue !== undefined && hasCount && (
            <span className="text-right tabular-nums text-text-muted" />
          )}
          {hasPct && (
            <span className="text-right tabular-nums text-text-muted">{showTotalPct ? "100%" : ""}</span>
          )}
        </div>
      )}
    </div>
  );
}
