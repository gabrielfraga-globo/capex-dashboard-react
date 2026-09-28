import type { ReactNode } from "react";

interface KpiStatProps {
  icon: ReactNode;
  label: string;
  value: string;
  context?: string;
  tone?: "neutral" | "info" | "warn" | "crit";
  onClick?: () => void;
}

export function KpiStat({ icon, label, value, context, tone = "neutral", onClick }: KpiStatProps) {
  const isClickable = !!onClick;
  
  const colors = {
    neutral: { text: "text-text", icon: "text-text-muted" },
    info: { text: "text-info", icon: "text-info" },
    warn: { text: "text-warn", icon: "text-warn" },
    crit: { text: "text-crit", icon: "text-crit" },
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isClickable}
      className={`flex-1 flex flex-col justify-start gap-1 px-4 py-3 rounded-card border border-border bg-card text-left transition-colors h-full ${isClickable ? "hover:border-accent/60 cursor-pointer" : "cursor-default"}`}
    >
      <div className="flex items-center gap-2">
        <span className={`shrink-0 ${colors.icon}`}>{icon}</span>
        <span className="text-[12px] font-semibold text-text-muted leading-snug">{label}</span>
      </div>
      <div className={`text-[28px] font-bold tabular-nums leading-none mt-1 ${colors.text}`}>
        {value}
      </div>
      {context && (
        <div className="text-[11px] text-text-faint leading-tight mt-1">{context}</div>
      )}
    </button>
  );
}
