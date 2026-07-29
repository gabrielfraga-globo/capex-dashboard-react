import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { InfoTooltip } from "./primitives";

export function BentoCard({
  title,
  icon,
  tooltip,
  defaultOpen = false,
  badge,
  children,
  className,
}: {
  title: string;
  icon?: ReactNode;
  tooltip?: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn("rounded-card border border-border bg-gradient-to-b from-card-alt to-card shadow-card overflow-hidden", className)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-text">
          {icon}
          {title}
          {tooltip && <InfoTooltip text={tooltip} />}
          {badge}
        </span>
        {open ? <ChevronDown size={16} className="text-text-muted shrink-0" /> : <ChevronRight size={16} className="text-text-muted shrink-0" />}
      </button>
      {open && <div className="px-4 pb-4 border-t border-border-subtle pt-3">{children}</div>}
    </div>
  );
}
