import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";
import { cn } from "../../lib/utils";
import type { StatusRisco } from "../../types";

// ---------------------------------------------------------------- Card ----
export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-card border border-border bg-gradient-to-b from-card-alt to-card shadow-card p-4",
        className
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- KPI Card
export function KpiCard({
  label,
  value,
  sub,
  tooltip,
}: {
  label: string;
  value: string;
  sub?: string;
  tooltip?: string;
}) {
  return (
    <Card>
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-text-muted font-semibold">
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <div className="text-2xl font-bold text-text mt-1">{value}</div>
      {sub && <div className="text-[11px] text-text-faint mt-1">{sub}</div>}
    </Card>
  );
}

// --------------------------------------------------------- Status card ----
const STATUS_STYLES: Record<StatusRisco, string> = {
  "Normal": "from-risk-baixo to-emerald-700 text-emerald-950",
  "Risco de Não Realização": "from-risk-alto to-orange-800 text-white",
  "Revisão de Fluxo de Caixa": "from-risk-revisao to-indigo-800 text-white",
  "Estouro": "from-risk-critico to-red-900 text-white",
  "Dados insuficientes": "from-slate-500 to-slate-700 text-white",
};

export function StatusCard({ status, n, label, sub }: { status: StatusRisco; n: number; label: string; sub?: string }) {
  return (
    <div className={cn("rounded-card p-4 shadow-card bg-gradient-to-br", STATUS_STYLES[status])}>
      <div className="text-2xl font-extrabold">{n}</div>
      <div className="text-[12.5px] font-bold opacity-95">{label}</div>
      {sub && <div className="text-[11px] opacity-85 mt-1">{sub}</div>}
    </div>
  );
}

// -------------------------------------------------------------- Badge -----
const BADGE_STYLES: Record<StatusRisco, string> = {
  "Estouro": "bg-risk-critico text-white",
  "Risco de Não Realização": "bg-risk-alto text-white",
  "Revisão de Fluxo de Caixa": "bg-risk-revisao text-white",
  "Normal": "bg-risk-baixo text-emerald-950",
  "Dados insuficientes": "bg-slate-500 text-white",
};

const STATUS_ICON: Record<StatusRisco, string> = {
  "Estouro": "🔴",
  "Risco de Não Realização": "🟠",
  "Revisão de Fluxo de Caixa": "🔵",
  "Normal": "🟢",
  "Dados insuficientes": "⚪",
};

export function RiskBadge({ status }: { status: StatusRisco }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold", BADGE_STYLES[status])}>
      <span aria-hidden>{STATUS_ICON[status]}</span> {status}
    </span>
  );
}

// ----------------------------------------------------------- InfoTooltip --
export function InfoTooltip({ text }: { text: string }) {
  return (
    <TooltipPrimitive.Provider delayDuration={150}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <button type="button" aria-label={text} className="info-icon inline-flex items-center">
            <Info size={13} />
          </button>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            className="max-w-xs rounded-md border border-border bg-card-alt px-3 py-2 text-xs text-text shadow-card z-50"
          >
            {text}
            <TooltipPrimitive.Arrow className="fill-card-alt" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

// -------------------------------------------------------------- Button ----
export function Button({
  className,
  variant = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "ghost" | "outline" }) {
  const variants = {
    default: "bg-accent text-white hover:bg-blue-500",
    ghost: "bg-transparent text-text-muted hover:text-text hover:bg-card-alt",
    outline: "bg-transparent border border-border text-text hover:bg-card-alt",
  };
  return (
    <button
      className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors", variants[variant], className)}
      {...props}
    />
  );
}

// ------------------------------------------------------ Section header ---
export function SectionHeader({ title, tooltip }: { title: string; tooltip?: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-3">
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      {tooltip && <InfoTooltip text={tooltip} />}
    </div>
  );
}
