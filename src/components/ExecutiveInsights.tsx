import { useMemo } from "react";
import type { KPIEstrategicoCarteira, StatusSemaforo } from "../types";

const KPI_LABEL: Record<KPIEstrategicoCarteira["id"], string> = {
  velocidadeCaixa: "Velocidade do Caixa",
  empenho: "Empenho",
  equilibrioFinanceiro: "Equilíbrio Financeiro",
};

const KPI_STATUS_COLOR: Record<StatusSemaforo, string> = {
  verde: "text-risk-baixo",
  amarelo: "text-risk-medio",
  vermelho: "text-risk-alto",
  nd: "text-text-faint",
};

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function monthReferenceLabel(date: Date): string {
  const previousMonth = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return `${MONTHS[previousMonth.getMonth()]}/${previousMonth.getFullYear()}`;
}

function normalizeStatusText(kpiId: KPIEstrategicoCarteira["id"], statusLabel: string | null): string {
  if (!statusLabel) return "N/D";

  if (kpiId === "velocidadeCaixa") {
    if (statusLabel === "Atrasado") return "atrasada";
    if (statusLabel === "Acelerado") return "acelerada";
  }

  return statusLabel.toLocaleLowerCase("pt-BR");
}

export function ExecutiveInsights({ kpis }: { kpis: KPIEstrategicoCarteira[] }) {
  const kpiById = useMemo(() => {
    const map = new Map<KPIEstrategicoCarteira["id"], KPIEstrategicoCarteira>();
    for (const kpi of kpis) map.set(kpi.id, kpi);
    return map;
  }, [kpis]);

  const velocidade = kpiById.get("velocidadeCaixa") ?? null;
  const empenho = kpiById.get("empenho") ?? null;
  const equilibrio = kpiById.get("equilibrioFinanceiro") ?? null;

  const referenciaMes = useMemo(() => monthReferenceLabel(new Date()), []);

  const velocidadeTexto = normalizeStatusText("velocidadeCaixa", velocidade?.statusLabel ?? null);
  const empenhoTexto = normalizeStatusText("empenho", empenho?.statusLabel ?? null);
  const equilibrioTexto = normalizeStatusText("equilibrioFinanceiro", equilibrio?.statusLabel ?? null);

  const velocidadeClasse = KPI_STATUS_COLOR[velocidade?.status ?? "nd"];
  const empenhoClasse = KPI_STATUS_COLOR[empenho?.status ?? "nd"];
  const equilibrioClasse = KPI_STATUS_COLOR[equilibrio?.status ?? "nd"];

  return (
    <p className="mb-3 text-sm leading-relaxed text-text-muted" aria-live="polite">
      No mês de referência <span className="font-semibold text-text">[{referenciaMes}]</span>, a carteira apresenta{" "}
      <span className={`font-semibold ${velocidadeClasse}`}>
        {KPI_LABEL.velocidadeCaixa} {velocidadeTexto}
      </span>
      , acompanhada de{" "}
      <span className={`font-semibold ${empenhoClasse}`}>
        {KPI_LABEL.empenho} {empenhoTexto}
      </span>{" "}
      e{" "}
      <span className={`font-semibold ${equilibrioClasse}`}>
        {KPI_LABEL.equilibrioFinanceiro} {equilibrioTexto}
      </span>
      .
    </p>
  );
}