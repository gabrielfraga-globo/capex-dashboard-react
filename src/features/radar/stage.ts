import type { CommitmentSource, CommitmentSourceLine } from "./types";
import type { StageConfig as StageConfigType } from "./stageConfig";
import { stageConfig } from "./stageConfig";

export type StageCode =
  | "E0"
  | "E1"
  | "E2"
  | "E3"
  | "E4"
  | "E5"
  | "E6"
  | "RESIDUAL"
  | "DESCONHECIDA";

export type StageSubState =
  | "E2_SEM_COMPRADOR"
  | "E4_ATRASADO"
  | "E4_PARCIAL"
  | "E4_CHEGOU"
  | "NONE"
  | "RESIDUAL"
  | "DESCONHECIDA";

export type OwnerRole = "GESTOR_PROJETO" | "APROVADOR" | "COMPRADOR" | "FORNECEDOR" | "GESTOR" | "FINANCEIRO" | "TESOURARIA" | "N5_COMPRAS" | "DESCONHECIDA";

export type StageConfig = StageConfigType;

export interface StageInput {
  statusCompromisso?: string | null;
  statusRc?: string | null;
  ordemCompra?: string | null;
  oc?: string | null;
  comprador?: string | null;
  fornecedor?: string | null;
  aprovador?: string | null;
  gestor?: string | null;
  dataPrometida?: string | null;
  systemPromisedDate?: string | null;
  dataNecessidade?: string | null;
  systemNeedDate?: string | null;
  dtCriacaoComp?: string | null;
  dtReqAprov?: string | null;
  valorCompromisso?: number | null;
  sourceValue?: number | null;
  value?: number | null;
  entregaParcial?: boolean | null;
  chegouFisicamente?: boolean | null;
  manualPaymentMode?: "Normal" | "Antecipado" | "Medição mensal" | null;
  status?: string | null;
}

export interface OwnerRoleResult {
  role: OwnerRole;
  name: string | null;
  area: string;
}

export interface StageReportEntry {
  stage: StageCode;
  lines: number;
  value: number;
  subStates: Record<string, number>;
}

export interface StageReport {
  totalLines: number;
  totalValue: number;
  byStage: Record<StageCode, StageReportEntry>;
  unknown: { lines: number; value: number; samples: string[]; reasons: Record<string, number> };
}

function normalizeStatus(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value || !String(value).trim()) return null;
  const iso = String(value).trim();
  const normalized = iso.includes("T") ? iso : `${iso}T00:00:00Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function diffDays(reference: Date, target: Date | null): number | null {
  if (!target) return null;
  const ms = reference.getTime() - target.getTime();
  return Math.floor(ms / 86_400_000);
}

function amountOf(input: StageInput): number {
  const direct =
    input.sourceValue ??
    input.valorCompromisso ??
    input.value ??
    0;

  return Number.isFinite(direct) ? Number(direct) : 0;
}

function hasOrderNumber(input: Pick<StageInput, "ordemCompra" | "oc">): boolean {
  const raw = String(input.ordemCompra ?? input.oc ?? "").trim();
  return raw.length > 0 && normalizeStatus(raw) !== "PENDING";
}

function isResidualStatus(status: string): boolean {
  return [
    "CLOSED",
    "CLOSED FOR INVOICING",
    "SEM PAGAMENTO",
    "",
  ].includes(status);
}

function ocOnlyStatus(status: string): boolean {
  const normalized = status.trim().toUpperCase();
  return [
    "OPEN",
    "CLOSED FOR RECEIVING",
    "CLOSED FOR INVOICING",
    "CLOSED",
    "INCOMPLETE",
    "RECEBIDO",
    "RECEBIDO | SEM CONTABILIZAÇÃO",
    "SEM PAGAMENTO",
  ].includes(normalized);
}

function resolveReferenceDate(referenceDate?: Date | string): Date {
  if (referenceDate instanceof Date) return referenceDate;
  if (typeof referenceDate === "string") return parseDate(referenceDate) ?? new Date();
  return stageConfig.referenceDate ?? new Date();
}

export function deriveStage(
  input: StageInput,
  options?: { referenceDate?: Date | string; config?: Partial<StageConfig> }
): StageCode {
  const config: StageConfig = {
    ...stageConfig,
    ...options?.config,
    referenceDate: options?.referenceDate ? resolveReferenceDate(options.referenceDate) : stageConfig.referenceDate,
  };
  const referenceDate = config.referenceDate;
  const statusCompromisso = normalizeStatus(input.statusCompromisso ?? input.status);
  const statusRc = normalizeStatus(input.statusRc);
  const saldo = amountOf(input);
  const hasOc = hasOrderNumber(input);

  if (!hasOc && statusCompromisso && ocOnlyStatus(statusCompromisso)) {
    return "DESCONHECIDA";
  }

  if (isResidualStatus(statusCompromisso) || saldo < config.residualBalance) return "RESIDUAL";

  if (statusCompromisso === "RECEBIDO" || statusCompromisso === "RECEBIDO | SEM CONTABILIZAÇÃO" || statusCompromisso === "SEM CONTABILIZAÇÃO") {
    return hasOc ? "E6" : "DESCONHECIDA";
  }

  if (statusCompromisso === "CLOSED FOR RECEIVING") {
    const baseDate = parseDate(input.dataPrometida ?? input.systemPromisedDate) ?? parseDate(input.dtCriacaoComp);
    const ageDays = diffDays(referenceDate, baseDate);
    const residualByAge = ageDays != null && ageDays > config.e5ResidualDays;
    if (residualByAge) return "RESIDUAL";
    return hasOc ? "E5" : "DESCONHECIDA";
  }

  if (statusCompromisso === "OPEN") return hasOc ? "E4" : "DESCONHECIDA";

  if (hasOc && (statusCompromisso === "PENDING APPROVAL" || statusCompromisso === "INCOMPLETE")) return "E3";
  if (statusRc === "APPROVED" && !hasOc) return "E2";
  if (statusRc === "PENDING APPROVAL" && !hasOc) return "E1";

  if (statusCompromisso === "APPROVED" && !hasOc) return "E2";
  if (statusCompromisso === "PENDING APPROVAL" && !hasOc) return "E1";

  return "DESCONHECIDA";
}

export function deriveSubState(
  input: StageInput,
  stage?: StageCode,
  options?: { referenceDate?: Date | string; config?: Partial<StageConfig> }
): StageSubState {
  const resolvedStage = stage ?? deriveStage(input, options);

  if (resolvedStage === "E2") {
    const comprado = String(input.comprador ?? "").trim();
    if (!comprado) return "E2_SEM_COMPRADOR";
    return "NONE";
  }

  if (resolvedStage === "E4") {
    const hasManualArrival = input.chegouFisicamente ?? false;
    if (hasManualArrival) return "E4_CHEGOU";

    const isPartialDelivery = input.entregaParcial ?? false;
    if (isPartialDelivery) return "E4_PARCIAL";

    const referenceDate = resolveReferenceDate(options?.referenceDate ?? stageConfig.referenceDate);
    const promisedDate = parseDate(input.dataPrometida ?? input.systemPromisedDate);
    if (promisedDate) {
      const overdue = (diffDays(referenceDate, promisedDate) ?? 0) > 0;
      if (overdue) return "E4_ATRASADO";
    }

    return "NONE";
  }

  return "NONE";
}

export function deriveOwnerRole(
  stage: StageCode | string,
  input: StageInput
): OwnerRoleResult {
  const resolvedStage = String(stage).toUpperCase();

  if (resolvedStage === "E0") {
    return {
      role: "GESTOR_PROJETO",
      name: input.gestor ?? null,
      area: "Tecnologia",
    };
  }

  if (resolvedStage === "E1") {
    return {
      role: "APROVADOR",
      name: input.aprovador ?? null,
      area: "Tecnologia",
    };
  }

  if (resolvedStage === "E2" || resolvedStage === "E3") {
    const name = input.comprador ?? null;
    return {
      role: "COMPRADOR",
      name,
      area: "Suprimentos",
    };
  }

  if (resolvedStage === "E4") {
    const hasManualArrival = input.chegouFisicamente ?? false;
    if (hasManualArrival) {
      return {
        role: "GESTOR",
        name: input.gestor ?? null,
        area: "Tecnologia",
      };
    }

    const partial = input.entregaParcial ?? false;
    if (partial) {
      return {
        role: "GESTOR",
        name: input.gestor ?? null,
        area: "Tecnologia",
      };
    }

    const referenceDate = resolveReferenceDate(stageConfig.referenceDate);
    const overdue = deriveSubState(input, "E4", { referenceDate }) === "E4_ATRASADO";
    if (overdue) {
      return {
        role: "COMPRADOR",
        name: input.comprador ?? null,
        area: "Suprimentos",
      };
    }

    return {
      role: "FORNECEDOR",
      name: input.fornecedor ?? null,
      area: "Fornecedor",
    };
  }

  if (resolvedStage === "E5") {
    return {
      role: "GESTOR",
      name: input.gestor ?? input.comprador ?? null,
      area: "Tecnologia",
    };
  }

  if (resolvedStage === "E6") {
    return {
      role: "FINANCEIRO",
      name: null,
      area: "Financeiro",
    };
  }

  return {
    role: "DESCONHECIDA",
    name: null,
    area: "Não definido",
  };
}

export function deriveDaysInStage(
  input: StageInput,
  stage?: StageCode,
  options?: { referenceDate?: Date | string; config?: Partial<StageConfig> }
): number | null {
  const resolvedStage = stage ?? deriveStage(input, options);
  const referenceDate = resolveReferenceDate(options?.referenceDate ?? stageConfig.referenceDate);

  switch (resolvedStage) {
    case "E1": {
      const date = parseDate(input.dtCriacaoComp);
      return date ? diffDays(referenceDate, date) : null;
    }
    case "E2": {
      const date = parseDate(input.dtReqAprov);
      return date ? diffDays(referenceDate, date) : null;
    }
    case "E4": {
      const date = parseDate(input.dataPrometida ?? input.systemPromisedDate);
      return date ? diffDays(referenceDate, date) : null;
    }
    case "E3":
    case "E5":
    case "E6":
      return null;
    default:
      return null;
  }
}

export function buildStageReport(items: StageInput[], options?: { referenceDate?: Date | string; config?: Partial<StageConfig> }): StageReport {
  const report: StageReport = {
    totalLines: items.length,
    totalValue: items.reduce((acc, item) => acc + amountOf(item), 0),
    byStage: {
      E0: { stage: "E0", lines: 0, value: 0, subStates: {} },
      E1: { stage: "E1", lines: 0, value: 0, subStates: {} },
      E2: { stage: "E2", lines: 0, value: 0, subStates: {} },
      E3: { stage: "E3", lines: 0, value: 0, subStates: {} },
      E4: { stage: "E4", lines: 0, value: 0, subStates: {} },
      E5: { stage: "E5", lines: 0, value: 0, subStates: {} },
      E6: { stage: "E6", lines: 0, value: 0, subStates: {} },
      RESIDUAL: { stage: "RESIDUAL", lines: 0, value: 0, subStates: {} },
      DESCONHECIDA: { stage: "DESCONHECIDA", lines: 0, value: 0, subStates: {} },
    },
    unknown: { lines: 0, value: 0, samples: [], reasons: {} },
  };

  for (const item of items) {
    const stage = deriveStage(item, options);
    const entry = report.byStage[stage] ?? report.byStage.DESCONHECIDA;
    entry.lines += 1;
    entry.value += amountOf(item);

    const subState = deriveSubState(item, stage, options);
    if (subState !== "NONE") {
      entry.subStates[subState] = (entry.subStates[subState] ?? 0) + amountOf(item);
    }

    if (stage === "DESCONHECIDA") {
      const reason =
        !String(item.ordemCompra ?? item.oc ?? "").trim() && item.statusCompromisso && ocOnlyStatus(item.statusCompromisso)
          ? "status de OC sem OC"
          : "status fora da lista";

      report.unknown.lines += 1;
      report.unknown.value += amountOf(item);
      report.unknown.reasons[reason] = (report.unknown.reasons[reason] ?? 0) + 1;
      if (report.unknown.samples.length < 5) {
        report.unknown.samples.push(`${item.statusCompromisso ?? item.statusRc ?? "SEM_STATUS"} :: ${reason}`);
      }
    }
  }

  return report;
}

export function commitmentLineToStageInput(line: Partial<CommitmentSourceLine> & {
  statusCompromisso?: string | null;
  statusRc?: string | null;
  ordemCompra?: string | null;
  dataPrometida?: string | null;
  dataNecessidade?: string | null;
  valorCompromisso?: number | null;
  comprador?: string | null;
  fornecedor?: string | null;
  sourceValue?: number | null;
}): StageInput {
  const ordemCompra = line.ordemCompra && normalizeStatus(line.ordemCompra) !== "PENDING" ? line.ordemCompra : "";
  const valorCompromisso = line.valorCompromisso ?? line.sourceValue ?? 0;

  return {
    statusCompromisso: line.statusCompromisso ?? null,
    statusRc: line.statusRc ?? null,
    ordemCompra,
    oc: line.ordemCompra ?? undefined,
    dataPrometida: line.dataPrometida ?? null,
    dataNecessidade: line.dataNecessidade ?? null,
    valorCompromisso,
    sourceValue: valorCompromisso,
    value: valorCompromisso,
    comprador: line.comprador ?? undefined,
    fornecedor: line.fornecedor ?? undefined,
    aprovador: undefined,
    gestor: undefined,
  };
}

export function stageReportFromBundle(
  bundle: { commitments: CommitmentSource[] },
  options?: { referenceDate?: Date | string; config?: Partial<StageConfig> }
): StageReport {
  const items: StageInput[] = bundle.commitments.flatMap((item) => {
    const details = item.details.length ? item.details : [
      {
        idPpm: item.projectId,
        nomeLb: item.projectName,
        rubrica: item.rubrica,
        reqCompra: item.rc,
        ordemCompra: item.oc === "PENDING" ? "" : item.oc,
        fornecedor: item.supplier,
        comprador: "",
        statusCompromisso: item.systemStatus,
        statusRc: "",
        dataNecessidade: item.systemNeedDate,
        dataPrometida: item.systemPromisedDate,
        valorCompromisso: item.sourceValue,
      },
    ];

    return details.map((line) => commitmentLineToStageInput(line));
  });

  return buildStageReport(items, options);
}

export function stageReportFromCommitmentLines(
  lines: CommitmentSourceLine[],
  options?: { referenceDate?: Date | string; config?: Partial<StageConfig> }
): StageReport {
  return buildStageReport(
    lines.map((line) => ({
      statusCompromisso: line.statusCompromisso,
      statusRc: line.statusRc,
      ordemCompra: line.ordemCompra,
      dataPrometida: line.dataPrometida,
      dataNecessidade: line.dataNecessidade,
      valorCompromisso: line.valorCompromisso,
      comprador: line.comprador,
      fornecedor: line.fornecedor,
      aprovador: undefined,
      gestor: undefined,
    })),
    options
  );
}
