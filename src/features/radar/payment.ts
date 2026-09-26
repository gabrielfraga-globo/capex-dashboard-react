import { csvObjects } from "../../lib/csvProcessingCore";
import type { CommitmentSource, PaymentsSection } from "./types";
import { commitmentLineToStageInput, deriveStage } from "./stage";
import { stageConfig } from "./stageConfig";

export type PaymentStage = "E7" | "E8";

export interface PaymentRecord {
  rc: string | null;
  nf: string | null;
  nfIssueDate: string | null;
  paymentDate: string | null;
  paid: number;
  pending: number;
  projectName: string | null;
  n4: string | null;
  rubrica: string | null;
  approver: string | null;
  withoutRc: boolean;
}

export interface PaymentStageSummary {
  lines: number;
  paid: number;
  pending: number;
}

export interface PaymentReport {
  lines: number;
  paid: number;
  pending: number;
  e7DistinctRcCount: number;
  withoutRcLines: number;
  withoutRcValue: number;
  ignoredLines: number;
  paidAndPendingTogether: number;
  byStage: Record<PaymentStage, PaymentStageSummary>;
}

export interface PaymentOverlapRow {
  rc: string;
  paymentValue: number;
  commitmentValue: number;
  stages: Record<string, number>;
  dominantStage: string;
  dominantStageValue: number;
  pendingVsCommitment: {
    paymentPending: number;
    commitmentBalance: number;
    ratio: number;
    reason: string | null;
  };
  nfCount: number;
}

export interface PaymentOverlapReport {
  rows: PaymentOverlapRow[];
  totalPaymentValue: number;
  totalCommitmentValue: number;
  totalNfCount: number;
  rcCount: number;
  byDominantStage: Record<string, { lines: number; paymentValue: number }>;
}

export interface AggregateRealizadoRow {
  year: number;
  paid: number;
  pending: number;
}

export interface ReconciliationVsAggregateReport {
  detailed: { paid: number; pending: number; lines: number };
  aggregate: { paid: number; pending: number; lines: number };
  totalDifference: { paid: number; pending: number };
  difference: { paid: number; pending: number };
  withoutRc: { paid: number; pending: number; lines: number };
  withoutRcShare: { paid: number; pending: number };
  residual: { paid: number; pending: number };
  remainingAfterWithoutRc: { paid: number; pending: number };
}

function normalizeHeaderKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

function firstPresent(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return null;
}

function toMoney(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : Number.NaN;
  const cleaned = String(raw).trim();
  if (!cleaned) return 0;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseIsoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const directMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (directMatch) return text;

  const compactMatch = text.match(/^(\d{8})$/);
  if (compactMatch) {
    const match = compactMatch[1];
    return `${match.slice(0, 4)}-${match.slice(4, 6)}-${match.slice(6, 8)}`;
  }

  const withTime = text.replace(" ", "T").replace(",", ".");
  const date = new Date(withTime);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function extractNfIssueDate(nf: string | null): string | null {
  if (!nf) return null;
  const match = String(nf).match(/(\d{8})/);
  if (!match) return null;
  const raw = match[1];
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function normalizeRc(raw: string | null | undefined): string | null {
  const value = firstPresent(raw, String(raw ?? ""));
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeProjectName(raw: string | null | undefined): string | null {
  const plain = firstPresent(raw, String(raw ?? ""));
  return plain ? plain : null;
}

function parseRow(record: Record<string, string>): PaymentRecord | null {
  const normalized = Object.fromEntries(
    Object.entries(record).map(([key, value]) => [normalizeHeaderKey(key), value ?? ""])
  );

  const rc = normalizeRc(normalized.REQCOMPRA ?? normalized.REQ_COMPRA);
  const nf = firstPresent(normalized.NOTAFISCAL ?? normalized.NOTA_FISCAL, String(record.NOTA_FISCAL ?? ""));
  const projectName = normalizeProjectName(normalized.NOMELB ?? normalized.NOME_LB ?? normalized.NOMELB_);
  const n4 = firstPresent(normalized.N4);
  const rubrica = firstPresent(normalized.RUBRICA);
  const approver = firstPresent(normalized.APROVADOR, normalized["1ºAPROVADOR"], normalized["1APROVADOR"]);
  const paymentDate = parseIsoDate(firstPresent(normalized.NF_DTPAGAMENTO, normalized.NFDTPAGAMENTO));
  const paid = toMoney(firstPresent(normalized.REALIZADO_PAGO, normalized.REALIZADOPAGO));
  const pending = toMoney(firstPresent(normalized.REALIZADO_PENDENTE, normalized.REALIZADOPENDENTE));

  if (!Number.isFinite(paid) || !Number.isFinite(pending)) {
    return null;
  }

  if (!rc && !nf && !paymentDate && paid === 0 && pending === 0 && !projectName && !n4 && !rubrica && !approver) {
    return null;
  }

  const withoutRc = rc === null;

  return {
    rc,
    nf: nf || null,
    nfIssueDate: extractNfIssueDate(nf || null),
    paymentDate,
    paid,
    pending,
    projectName,
    n4,
    rubrica,
    approver,
    withoutRc,
  };
}

export function buildPaymentsSection(records: PaymentRecord[]): PaymentsSection {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Realizado_Detalhado.csv vazio ou inválido: sem linhas de pagamento disponíveis");
  }

  const inPayment = records.filter((record) => record.pending !== 0);
  const paid = records.reduce((sum, record) => sum + record.paid, 0);
  const pending = records.reduce((sum, record) => sum + record.pending, 0);
  const withoutRcLines = records.filter((record) => !record.rc).length;
  const withoutRcValue = records
    .filter((record) => !record.rc)
    .reduce((sum, record) => sum + record.paid + record.pending, 0);

  if (![paid, pending, withoutRcValue].every(Number.isFinite)) {
    throw new Error("Realizado_Detalhado.csv com totais não finitos: paid, pending ou withoutRcValue inválidos");
  }

  return {
    generatedFrom: "Realizado_Detalhado.csv",
    inPayment: inPayment.map((record) => ({
      ...record,
      withoutRc: record.withoutRc,
    })),
    totals: {
      paid,
      pending,
      inPaymentLines: inPayment.length,
      inPaymentRcs: new Set(inPayment.filter((record) => record.rc).map((record) => record.rc!)).size,
      withoutRcLines,
      withoutRcValue,
    },
  };
}

export function attachPaymentsSection(
  bundle: { payments?: PaymentsSection } | Record<string, unknown>,
  csvText: string | null
): { bundle: { payments?: PaymentsSection }; status: "ok" | "skipped"; reason?: string } {
  if (csvText === null || csvText.trim() === "") {
    return { bundle, status: "skipped", reason: "csv nulo ou vazio" };
  }

  const rows = parsePaymentCsv(csvText);
  if (rows.length === 0) {
    return { bundle, status: "skipped", reason: "csv sem linhas válidas" };
  }

  try {
    const section = buildPaymentsSection(rows);
    return {
      bundle: { ...bundle, payments: section },
      status: "ok",
    };
  } catch (error) {
    return {
      bundle,
      status: "skipped",
      reason: error instanceof Error ? error.message : "csv inválido",
    };
  }
}

function hasPaymentColumns(rows: Array<Record<string, string>>): boolean {
  return rows.some((row) =>
    Object.keys(row).some((key) => {
      const normalized = normalizeHeaderKey(key);
      return normalized === "REALIZADOPAGO" || normalized === "REALIZADO_PAGO" || normalized === "REALIZADOPENDENTE" || normalized === "REALIZADO_PENDENTE";
    })
  );
}

export function parsePaymentCsv(csvText: string): PaymentRecord[] {
  const rows = csvObjects(csvText);
  if (rows.length === 0 || !hasPaymentColumns(rows)) {
    return [];
  }

  return rows
    .map((row) => parseRow(row))
    .filter((row): row is PaymentRecord => row !== null);
}

export function derivePaymentStage(record: PaymentRecord): PaymentStage | null {
  if (record.pending !== 0) return "E7";
  if (record.paid !== 0) return "E8";
  return null;
}

export function derivePaymentStages(record: PaymentRecord): PaymentStage[] {
  const stages: PaymentStage[] = [];
  if (record.pending !== 0) stages.push("E7");
  if (record.paid !== 0) stages.push("E8");
  return stages;
}

export function paymentReport(records: PaymentRecord[]): PaymentReport {
  const byStage: Record<PaymentStage, PaymentStageSummary> = {
    E7: { lines: 0, paid: 0, pending: 0 },
    E8: { lines: 0, paid: 0, pending: 0 },
  };

  let ignoredLines = 0;
  let paidAndPendingTogether = 0;
  let withoutRcLines = 0;
  let withoutRcValue = 0;

  for (const record of records) {
    const stages = derivePaymentStages(record);
    if (stages.length === 0) ignoredLines += 1;
    if (record.paid !== 0 && record.pending !== 0) paidAndPendingTogether += 1;
    if (!record.rc) {
      withoutRcLines += 1;
      withoutRcValue += record.paid + record.pending;
    }

    for (const stage of stages) {
      byStage[stage].lines += 1;
      byStage[stage].paid += record.paid;
      byStage[stage].pending += record.pending;
    }
  }

  const e7DistinctRcCount = new Set(
    records.filter((record) => derivePaymentStages(record).includes("E7") && record.rc).map((record) => record.rc!)
  ).size;

  return {
    lines: records.length,
    paid: records.reduce((sum, record) => sum + record.paid, 0),
    pending: records.reduce((sum, record) => sum + record.pending, 0),
    e7DistinctRcCount,
    withoutRcLines,
    withoutRcValue,
    ignoredLines,
    paidAndPendingTogether,
    byStage,
  };
}

export function overlapReport(
  bundle: { commitments: CommitmentSource[] },
  payments: PaymentRecord[],
  options?: { referenceDate?: Date | string }
): PaymentOverlapReport {
  const referenceDate = options?.referenceDate ?? stageConfig.referenceDate;
  const paymentByRc = new Map<string, { paymentValue: number; nfSet: Set<string> }>();

  for (const payment of payments) {
    const stages = derivePaymentStages(payment);
    if (!stages.includes("E7") || !payment.rc) continue;
    const current = paymentByRc.get(payment.rc) ?? { paymentValue: 0, nfSet: new Set<string>() };
    current.paymentValue += payment.pending;
    if (payment.nf) current.nfSet.add(payment.nf);
    paymentByRc.set(payment.rc, current);
  }

  const commitmentByRc = new Map<string, { commitmentValue: number; stages: Record<string, number>; stageValues: Record<string, number>; dominantStage: string; dominantStageValue: number }>();
  for (const commitment of bundle.commitments) {
    const details = commitment.details.length ? commitment.details : [{
      idPpm: commitment.projectId,
      nomeLb: commitment.projectName,
      rubrica: commitment.rubrica,
      reqCompra: commitment.rc,
      ordemCompra: commitment.oc === "PENDING" ? "" : commitment.oc,
      fornecedor: commitment.supplier,
      comprador: "",
      statusCompromisso: commitment.systemStatus,
      statusRc: "",
      dataNecessidade: commitment.systemNeedDate,
      dataPrometida: commitment.systemPromisedDate,
      valorCompromisso: commitment.sourceValue,
    }];

    const current = commitmentByRc.get(commitment.rc) ?? {
      commitmentValue: 0,
      stages: {},
      stageValues: {},
      dominantStage: "DESCONHECIDA",
      dominantStageValue: 0,
    };

    for (const line of details) {
      const lineValue = Number(line.valorCompromisso ?? 0);
      current.commitmentValue += lineValue;
      const stage = deriveStage(commitmentLineToStageInput(line), { referenceDate });
      current.stages[stage] = (current.stages[stage] ?? 0) + 1;
      current.stageValues[stage] = (current.stageValues[stage] ?? 0) + lineValue;
      if (current.stageValues[stage] > current.dominantStageValue) {
        current.dominantStage = stage;
        current.dominantStageValue = current.stageValues[stage];
      }
    }

    commitmentByRc.set(commitment.rc, current);
  }

  const rows: PaymentOverlapRow[] = [];
  for (const [rc, payment] of paymentByRc.entries()) {
    if (!commitmentByRc.has(rc)) continue;
    const commitment = commitmentByRc.get(rc)!;
    const commitmentBalance = commitment.commitmentValue;
    const ratio = commitmentBalance === 0 ? 0 : payment.paymentValue / commitmentBalance;
    const reason = ratio >= 0.9 && ratio <= 1.1 ? "pendente ~ saldo" : null;
    rows.push({
      rc,
      paymentValue: payment.paymentValue,
      commitmentValue: commitmentBalance,
      stages: commitment.stages,
      dominantStage: commitment.dominantStage,
      dominantStageValue: commitment.dominantStageValue,
      pendingVsCommitment: {
        paymentPending: payment.paymentValue,
        commitmentBalance,
        ratio,
        reason,
      },
      nfCount: payment.nfSet.size,
    });
  }

  rows.sort((left, right) => right.paymentValue - left.paymentValue);

  const byDominantStage: Record<string, { lines: number; paymentValue: number }> = {};
  for (const row of rows) {
    const current = byDominantStage[row.dominantStage] ?? { lines: 0, paymentValue: 0 };
    current.lines += 1;
    current.paymentValue += row.paymentValue;
    byDominantStage[row.dominantStage] = current;
  }

  return {
    rows,
    totalPaymentValue: rows.reduce((sum, row) => sum + row.paymentValue, 0),
    totalCommitmentValue: rows.reduce((sum, row) => sum + row.commitmentValue, 0),
    totalNfCount: rows.reduce((sum, row) => sum + row.nfCount, 0),
    rcCount: rows.length,
    byDominantStage,
  };
}

export function parseAggregateRealizadoCsv(csvText: string): AggregateRealizadoRow[] {
  const rows = csvObjects(csvText);
  const aggregates = new Map<number, { paid: number; pending: number; lines: number }>();

  for (const row of rows) {
    const normalized = Object.fromEntries(
      Object.entries(row).map(([key, value]) => [normalizeHeaderKey(key), String(value ?? "")])
    );
    const year = Number(firstPresent(normalized.ANO) ?? "0");
    if (!Number.isFinite(year) || year < 2020) continue;
    const paid = toMoney(firstPresent(normalized.REALIZADOPAGO, normalized.REALIZADO_PAGO));
    const pending = toMoney(firstPresent(normalized.REALIZADOPENDENTE, normalized.REALIZADO_PENDENTE));

    const current = aggregates.get(year) ?? { paid: 0, pending: 0, lines: 0 };
    current.paid += paid;
    current.pending += pending;
    current.lines += 1;
    aggregates.set(year, current);
  }

  return [...aggregates.entries()].map(([year, value]) => ({
    year,
    paid: value.paid,
    pending: value.pending,
  }));
}

export function reconciliationVsAggregate(
  payments: PaymentRecord[],
  aggregateSource: string | AggregateRealizadoRow[]
): ReconciliationVsAggregateReport {
  const detailed = paymentReport(payments);
  const aggregateRows = typeof aggregateSource === "string"
    ? parseAggregateRealizadoCsv(aggregateSource)
    : aggregateSource;

  const aggregate = aggregateRows
    .filter((row) => row.year === 2026)
    .reduce(
      (acc, row) => ({
        paid: acc.paid + row.paid,
        pending: acc.pending + row.pending,
        lines: acc.lines + 1,
      }),
      { paid: 0, pending: 0, lines: 0 }
    );

  const withoutRc = payments.filter((record) => !record.rc);
  const withoutRcPaid = withoutRc.reduce((sum, record) => sum + record.paid, 0);
  const withoutRcPending = withoutRc.reduce((sum, record) => sum + record.pending, 0);

  const totalDifference = {
    paid: detailed.paid - aggregate.paid,
    pending: detailed.pending - aggregate.pending,
  };
  const residual = {
    paid: totalDifference.paid - withoutRcPaid,
    pending: totalDifference.pending - withoutRcPending,
  };

  return {
    detailed: {
      paid: detailed.paid,
      pending: detailed.pending,
      lines: detailed.lines,
    },
    aggregate: {
      paid: aggregate.paid,
      pending: aggregate.pending,
      lines: aggregate.lines,
    },
    totalDifference,
    difference: totalDifference,
    withoutRc: {
      paid: withoutRcPaid,
      pending: withoutRcPending,
      lines: withoutRc.length,
    },
    withoutRcShare: {
      paid: withoutRcPaid,
      pending: withoutRcPending,
    },
    residual,
    remainingAfterWithoutRc: residual,
  };
}

export function getPaymentReportSummary(records: PaymentRecord[]) {
  return paymentReport(records);
}
