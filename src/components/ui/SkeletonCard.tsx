import { cn } from "../../lib/utils";

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("rounded bg-border/60 animate-pulse", className)} aria-hidden="true" />;
}

/** Layout skeleton que espelha o bento-grid 2×2 do RadarExecutivo. */
export function SkeletonRadar() {
  return (
    <div role="status" aria-label="Carregando dados da carteira…" aria-busy="true" className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-card border border-border bg-card-alt animate-pulse h-60" aria-hidden="true" />
        <div className="rounded-card border border-border bg-card-alt animate-pulse h-60" aria-hidden="true" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-card border border-border bg-card-alt animate-pulse h-44" aria-hidden="true" />
        <div className="rounded-card border border-border bg-card-alt animate-pulse h-44" aria-hidden="true" />
      </div>
    </div>
  );
}

/** Skeleton simples para listas de linhas (Rankings, ActionPlan, etc.). */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Carregando…" aria-busy="true" className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-1.5" aria-hidden="true">
          <div className="h-4 w-4 rounded-full bg-border/60 animate-pulse shrink-0" />
          <div className="flex-1 h-4 rounded bg-border/60 animate-pulse" />
          <div className="h-4 w-16 rounded bg-border/60 animate-pulse shrink-0" />
        </div>
      ))}
    </div>
  );
}
