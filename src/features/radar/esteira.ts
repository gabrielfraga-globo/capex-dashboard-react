import type { OperationalRow } from "./operational";

export type DisplayStage =
  | 'A_EMITIR'
  | 'RC_APROVACAO'
  | 'NEGOCIACAO'
  | 'OC_APROVACAO'
  | 'AGUARDANDO'
  | 'EM_PAGAMENTO';

export type Directorate = 'Tecnologia' | 'Suprimentos' | 'Contas a Pagar';

export const DISPLAY_STAGE_LABELS: Record<DisplayStage, string> = {
  A_EMITIR: "A emitir",
  RC_APROVACAO: "RC em aprovação",
  NEGOCIACAO: "Negociação / emissão de OC",
  OC_APROVACAO: "OC em aprovação",
  AGUARDANDO: "Aguardando entrega / pagamento",
  EM_PAGAMENTO: "Em pagamento"
};

export function displayStage(row: { stage: string; tooltip?: { statusCompromisso?: string | null } }): DisplayStage | null {
  const status = row.tooltip?.statusCompromisso?.trim().toUpperCase() || "";
  if (status === "CANCELLED") return null;
  if (status === "INCOMPLETE") return "NEGOCIACAO";

  switch (row.stage) {
    case "E0": return "A_EMITIR";
    case "E1": return "RC_APROVACAO";
    case "E2": return "NEGOCIACAO";
    case "E3": return "OC_APROVACAO";
    case "E4":
    case "E5":
    case "E6": return "AGUARDANDO";
    case "E7": return "EM_PAGAMENTO";
    default: return null;
  }
}

export function directorateOf(stage: DisplayStage): Directorate {
  switch (stage) {
    case 'A_EMITIR':
    case 'RC_APROVACAO':
      return 'Tecnologia';
    case 'NEGOCIACAO':
    case 'OC_APROVACAO':
    case 'AGUARDANDO':
      return 'Suprimentos';
    case 'EM_PAGAMENTO':
      return 'Contas a Pagar';
  }
}

export interface StageCounter {
  count: number;
  value: number;
}

export function buildStageCounters(
  opRows: Pick<OperationalRow, 'stage' | 'value' | 'tooltip'>[],
  aEmitirValue: number,
  /** E7 não é linha de OperationalRow: vem de bundle.payments (buildPipelineCounters().byStage.E7) */
  emPagamento: StageCounter = { count: 0, value: 0 }
): Record<DisplayStage, StageCounter> {
  const counters = {
    A_EMITIR: { count: 0, value: aEmitirValue },
    RC_APROVACAO: { count: 0, value: 0 },
    NEGOCIACAO: { count: 0, value: 0 },
    OC_APROVACAO: { count: 0, value: 0 },
    AGUARDANDO: { count: 0, value: 0 },
    EM_PAGAMENTO: { count: emPagamento.count, value: emPagamento.value }
  } as Record<DisplayStage, StageCounter>;

  for (const row of opRows) {
    const ds = displayStage(row);
    if (ds && ds !== 'A_EMITIR') {
      counters[ds].count += 1;
      counters[ds].value += row.value;
    }
  }

  return counters;
}

export interface DirectorateBreakdown {
  label: Directorate;
  value: number;
  pct: number;
}

export function buildDirectorateBreakdown(
  opRows: Pick<OperationalRow, 'stage' | 'value' | 'tooltip'>[],
  aEmitirValue: number,
  emPagamento: StageCounter = { count: 0, value: 0 }
): DirectorateBreakdown[] {
  const counters = buildStageCounters(opRows, aEmitirValue, emPagamento);
  const sums: Record<Directorate, number> = {
    Tecnologia: 0,
    Suprimentos: 0,
    'Contas a Pagar': 0
  };

  let total = 0;
  for (const [stage, c] of Object.entries(counters)) {
    const dir = directorateOf(stage as DisplayStage);
    sums[dir] += c.value;
    total += c.value;
  }

  return (Object.keys(sums) as Directorate[]).map(dir => ({
    label: dir,
    value: sums[dir],
    pct: total > 0 ? sums[dir] / total : 0
  }));
}
