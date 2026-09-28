import { fmtPct } from "../../../lib/format";

interface Segment {
  key: string;
  label: string;
  pct: number; // 0..100
  color: string; // Tailwind bg class
}

interface SegmentedBarProps {
  parts: Segment[];
}

export function SegmentedBar({ parts }: SegmentedBarProps) {
  return (
    <div className="w-full">
      <div className="flex h-7 w-full rounded overflow-hidden gap-0.5 bg-border">
        {parts.map((seg) => (
          seg.pct > 0 ? (
            <div
              key={seg.key}
              className={`${seg.color} flex items-center justify-center`}
              style={{ width: `${seg.pct}%` }}
              title={`${seg.label}: ${fmtPct(seg.pct / 100)}`}
            >
              {seg.pct >= 6 && (
                <span className="text-[10px] font-bold text-white/90">
                  {Math.round(seg.pct)}%
                </span>
              )}
            </div>
          ) : null
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {parts.filter((seg) => seg.pct > 0).map((seg) => (
          <span key={`legend-${seg.key}`} className="text-[11px] leading-none flex items-center gap-1.5 text-text-muted">
            <span className={`w-2 h-2 rounded-full ${seg.color}`} aria-hidden="true" />
            {seg.label}: {fmtPct(seg.pct / 100)}
          </span>
        ))}
      </div>
    </div>
  );
}
