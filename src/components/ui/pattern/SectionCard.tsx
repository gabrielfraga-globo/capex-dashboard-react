import type { ReactNode } from "react";

interface SectionCardProps {
  title: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  children: ReactNode;
}

export function SectionCard({ title, action, children }: SectionCardProps) {
  return (
    <div className="flex flex-col rounded-card border border-border bg-card px-5 pt-4 pb-4">
      <div className="flex items-center justify-between shrink-0 mb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">{title}</p>
        {action && (
          <button
            type="button"
            className="text-[12px] font-semibold text-info hover:underline"
            onClick={action.onClick}
          >
            {action.label}
          </button>
        )}
      </div>
      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
}
