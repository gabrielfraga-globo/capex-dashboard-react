import type { CommitmentSource, CommitmentSourceBundle, CommitmentSourceLine, RcGroup } from "../src/features/radar/types";
import { PAYMENT_LEAD_DAYS, PENDING_OC } from "../src/features/radar/types";

/** Linha bruta do compromissos_detalhados.csv, como lida do arquivo. */
export interface RawCsvRow {
  IdPPM: string;
  NomeLB: string;
  Rubrica: string;
  REQ_COMPRA: string;
  ORDEM_DE_COMPRA: string;
  FORNECEDOR: string;
  COMPRADOR: string;
  STATUS_COMPROMISSO: string;
  STATUS_RC: string;
  DATA_NECESSIDADE: string;
  DATA_PROMETIDA: string;
  ValorCompromisso: string;
}

/** Milhar '.', decimal ','. Aceita negativo. Ex.: "24344,9" -> 24344.9. */
function parseDecimalPtBr(value: string | undefined): number {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return 0;
  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Formato "AAAA-MM-DD hh:mm:ss,SSS". Vazio ou inválido retorna null, nunca lança erro. */
function parseData(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  return match ? match[1] : null;
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function distinct<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function normalizarLinha(linha: RawCsvRow): CommitmentSourceLine {
  const ordemCompra = linha.ORDEM_DE_COMPRA.trim();
  return {
    idPpm: linha.IdPPM.trim(),
    nomeLb: linha.NomeLB,
    rubrica: linha.Rubrica,
    reqCompra: linha.REQ_COMPRA.trim(),
    ordemCompra: ordemCompra || null,
    fornecedor: linha.FORNECEDOR,
    comprador: linha.COMPRADOR,
    statusCompromisso: linha.STATUS_COMPROMISSO,
    statusRc: linha.STATUS_RC,
    dataNecessidade: parseData(linha.DATA_NECESSIDADE),
    dataPrometida: parseData(linha.DATA_PROMETIDA),
    valorCompromisso: parseDecimalPtBr(linha.ValorCompromisso),
  };
}

/** Consolida o CSV de compromissos no grão RC+OC+PPM e agrupa por RC, conforme a seção 4 do RADAR_IMPLEMENTACAO. */
export function consolidarCompromissos(linhasCsv: RawCsvRow[], exercicio: number): CommitmentSourceBundle {
  const mapaChaves = new Map<string, CommitmentSource>();
  let discardedLines = 0;

  for (const linha of linhasCsv) {
    const rc = linha.REQ_COMPRA.trim();
    const oc = linha.ORDEM_DE_COMPRA.trim() || PENDING_OC;
    const ppm = linha.IdPPM.trim();

    if (!rc || !ppm) {
      discardedLines += 1;
      continue;
    }

    const commitmentKey = `RC:${rc}|OC:${oc}|PPM:${ppm}`;

    let reg = mapaChaves.get(commitmentKey);
    if (!reg) {
      reg = {
        commitmentKey,
        rc,
        oc,
        projectId: ppm,
        projectName: linha.NomeLB,
        rubrica: linha.Rubrica,
        supplier: linha.FORNECEDOR,
        systemStatus: linha.STATUS_COMPROMISSO,
        systemPromisedDate: null,
        systemNeedDate: null,
        sourceValue: 0,
        lineCount: 0,
        details: [],
      };
      mapaChaves.set(commitmentKey, reg);
    }

    reg.sourceValue += parseDecimalPtBr(linha.ValorCompromisso);
    reg.lineCount += 1;
    reg.details.push(normalizarLinha(linha));

    const dataPrometida = parseData(linha.DATA_PROMETIDA);
    if (dataPrometida && (!reg.systemPromisedDate || dataPrometida > reg.systemPromisedDate)) {
      reg.systemPromisedDate = dataPrometida;
    }

    const dataNecessidade = parseData(linha.DATA_NECESSIDADE);
    if (dataNecessidade && (!reg.systemNeedDate || dataNecessidade > reg.systemNeedDate)) {
      reg.systemNeedDate = dataNecessidade;
    }
  }

  const commitments = Array.from(mapaChaves.values());

  const porRc = new Map<string, CommitmentSource[]>();
  for (const commitment of commitments) {
    const itens = porRc.get(commitment.rc) ?? [];
    itens.push(commitment);
    porRc.set(commitment.rc, itens);
  }

  const corte = `${exercicio}-12-31`;
  const rcGroups: RcGroup[] = [];

  for (const [rc, itens] of porRc) {
    const projectIds = distinct(itens.map((item) => item.projectId));
    const ocs = distinct(itens.map((item) => item.oc));
    const suppliers = distinct(itens.map((item) => item.supplier));
    const statuses = distinct(itens.map((item) => item.systemStatus));
    const datas = distinct(
      itens.map((item) => item.systemPromisedDate).filter((data): data is string => data !== null)
    );

    const heterogeneityReasons: string[] = [];
    if (projectIds.length > 1) heterogeneityReasons.push("multiplos_projetos");
    if (ocs.length > 1) heterogeneityReasons.push("multiplas_ocs");
    if (suppliers.length > 1) heterogeneityReasons.push("multiplos_fornecedores");
    if (statuses.length > 1) heterogeneityReasons.push("status_divergente");
    if (datas.length > 1) heterogeneityReasons.push("datas_divergentes");

    const pagamentos = datas.map((data) => addDays(data, PAYMENT_LEAD_DAYS));
    const splitsExercise = pagamentos.some((p) => p <= corte) && pagamentos.some((p) => p > corte);
    if (splitsExercise) heterogeneityReasons.push("divide_exercicio");

    rcGroups.push({
      rc,
      commitmentKeys: itens.map((item) => item.commitmentKey),
      totalValue: sum(itens.map((item) => item.sourceValue)),
      projectIds,
      suppliers,
      ocs,
      isHeterogeneous: heterogeneityReasons.length > 0,
      heterogeneityReasons,
      splitsExercise,
    });
  }

  const totalCsv = sum(linhasCsv.map((linha) => parseDecimalPtBr(linha.ValorCompromisso)));
  const totalConsolidado = sum(commitments.map((item) => item.sourceValue));
  if (Math.abs(totalConsolidado - totalCsv) > 0.01) {
    throw new Error(
      `consolidarCompromissos: reconciliação de valor falhou (consolidado ${totalConsolidado} vs CSV ${totalCsv})`
    );
  }

  const totalLinhasConsolidadas = sum(commitments.map((item) => item.lineCount));
  if (totalLinhasConsolidadas !== linhasCsv.length - discardedLines) {
    throw new Error("consolidarCompromissos: reconciliação de linhas falhou");
  }

  return {
    generatedAt: new Date().toISOString(),
    exerciseYear: exercicio,
    commitments,
    rcGroups,
    discardedLines,
    totals: {
      value: totalConsolidado,
      lines: linhasCsv.length - discardedLines,
      keys: commitments.length,
      rcs: rcGroups.length,
    },
  };
}
