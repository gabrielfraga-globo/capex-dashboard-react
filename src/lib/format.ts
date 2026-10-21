export function fmtBRL(v: number | null | undefined, compact = false): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "N/D";
  if (compact) {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
    if (abs >= 1_000) return `R$ ${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}K`;
  }
  return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
}

export function formatCurrencyMillions(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "N/D";
  return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}M`;
}

/** Valor monetário curto: milhões sempre com 1 casa ("R$ 6,0M"); abaixo de R$ 1M segue em K. */
export function fmtMilhoes(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "N/D";
  return Math.abs(v) >= 1_000_000 ? formatCurrencyMillions(v) : fmtBRL(v, true);
}

export function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  return `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
}

export function fmtNumber(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  return v.toLocaleString("pt-BR");
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString("pt-BR");
}

// yyyy-mm-dd pelo calendário local (toISOString usa UTC e pode virar o dia após 21h em UTC-3).
export function formatarIsoLocal(d: Date): string {
  const yyyy = String(d.getFullYear()).padStart(4, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export const MESES_PT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];
