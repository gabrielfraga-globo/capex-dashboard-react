import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";

interface CollapsibleProps {
  title: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

export function Collapsible({ title, defaultOpen = false, open, onOpenChange, children }: CollapsibleProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const contentId = useId();

  function toggle() {
    const next = !isOpen;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  }

  const Icon = isOpen ? ChevronDown : ChevronRight;

  return (
    <div className="rounded-card border border-border bg-card">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={toggle}
        className={cn(
          "flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-text",
          "rounded-card transition-colors hover:bg-card-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
        )}
      >
        <Icon size={16} aria-hidden="true" className="shrink-0 text-text-muted" />
        {title}
      </button>
      {isOpen && (
        <div id={contentId} className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}
