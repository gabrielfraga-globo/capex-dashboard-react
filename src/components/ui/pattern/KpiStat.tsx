import type { ReactNode } from "react";

interface KpiStatProps {
  icon: ReactNode;
  label: string;
  value: string;
  context?: ReactNode;
  tone?: "neutral" | "info" | "warn" | "crit";
  onClick?: () => void;
  /** tooltip nativo do cartão */
  title?: string;
}

export function KpiStat({ icon, label, value, context, tone = "neutral", onClick, title }: KpiStatProps) {
  const isClickable = !!onClick;
  
  const colors = {
    neutral: { text: "text-text", icon: "text-text-muted" },
    info: { text: "text-info", icon: "text-info" },
    warn: { text: "text-warn", icon: "text-warn" },
    crit: { text: "text-crit", icon: "text-crit" },
  }[tone];

  const className = `flex-1 min-w-0 flex flex-col justify-start gap-1 px-4 py-3 rounded-card border border-border bg-card text-left transition-colors h-full ${isClickable ? "hover:border-accent/60 cursor-pointer" : "cursor-default"}`;

  const content = (
    <>
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
    </>
  );

  if (!onClick) {
    return (
      <button type="button" disabled title={title} className={className}>
        {content}
      </button>
    );
  }

  // Ações aninhadas (ex.: ⓘ do InfoTooltip) são <button>; não disparam o cartão.
  const isFromNestedButton = (target: EventTarget, current: EventTarget) =>
    (target as HTMLElement).closest("button") !== null && target !== current;

  return (
    <div
      role="button"
      tabIndex={0}
      title={title}
      onClick={(e) => {
        if (isFromNestedButton(e.target, e.currentTarget)) return;
        onClick();
      }}
      onKeyDown={(e) => {
        if (isFromNestedButton(e.target, e.currentTarget)) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
    >
      {content}
    </div>
  );
}
