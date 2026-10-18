import { csvObjects, normalizeKey } from "./csvProcessingCore.js";
import type { ProjetoBase } from "../types/index.js";
import type {
  SaldoIdentityError,
  SaldoProjetoLinha,
  SaldoProjetosSection,
  SaldoReconcileCheck,
  SaldoTotals,
} from "../features/radar/types.js";
import {
  SALDO_BI_RULES,
  SALDO_COLUMNS,
  SALDO_IDENTITY_TOLERANCE,
  SALDO_RECONCILE_TOLERANCE,
} from "../features/saldo/saldoConfig.js";

const MAX_IDENTITY_ERRORS = 20;
const RUBRICA_NAO_INFORMADA = "NAO_INFORMADA";
const ANO_PATTERN = /^-?\d+$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?: \d{2}:\d{2}:\d{2}(?:,\d{3})?)?$/;
const BR_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function parseNumberPtBr(value: string): number {
  const cleaned = value.trim();
  if (!cleaned) return 0;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (!isValidYmd(year, month, day)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateLoose(value: string): string | null {
  const text = value.trim();
  const iso = ISO_DATE_PATTERN.exec(text);
  if (iso) return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const br = BR_DATE_PATTERN.exec(text);
  if (br) return toIsoDate(Number(br[3]), Number(br[2]), Number(br[1]));
  return null;
}

function sumBy<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((acc, item) => acc + pick(item), 0);
}

function buildCheck(label: SaldoReconcileCheck["label"], saldo: number, carteira: number): SaldoReconcileCheck {
  const delta = saldo - carteira;
  return { label, saldo, carteira, delta, ok: Math.abs(delta) <= SALDO_RECONCILE_TOLERANCE };
}

export function buildSaldoProjetosSection(input: {
  csv: string;
  projetos: ProjetoBase[];
  generatedAt: string;
}): SaldoProjetosSection {
  const records = csvObjects(input.csv);
  if (!records.length) throw new Error("Saldo_Projetos.csv: CSV vazio.");

  const available = new Set(Object.keys(records[0]));
  const required = Object.values(SALDO_COLUMNS);
  const missing = required.filter((header) => !available.has(header));
  if (missing.length) throw new Error(`Saldo_Projetos.csv: colunas ausentes: ${missing.join(", ")}`);

  let discardedLines = 0;
  let dataReferencia: string | null = null;
  const linhas: SaldoProjetoLinha[] = [];

  for (const record of records) {
    const get = (column: string) => record[column] ?? "";
    const n4 = get(SALDO_COLUMNS.n4).trim();
    const nomeLB = get(SALDO_COLUMNS.nomeLB).trim();
    const anoText = get(SALDO_COLUMNS.ano).trim();
    if (!n4 || !nomeLB || !ANO_PATTERN.test(anoText)) {
      discardedLines++;
      continue;
    }

    if (dataReferencia === null) dataReferencia = parseDateLoose(get(SALDO_COLUMNS.dataReferencia));

    linhas.push({
      projectKey: `${normalizeKey(n4)}|${normalizeKey(nomeLB)}`,
      n4,
      aprovador: get(SALDO_COLUMNS.aprovador).trim() || null,
      nomeLB,
      rubrica: get(SALDO_COLUMNS.rubrica).trim() || RUBRICA_NAO_INFORMADA,
      ano: Number(anoText),
      orcamento: parseNumberPtBr(get(SALDO_COLUMNS.orcamento)),
      caixa: parseNumberPtBr(get(SALDO_COLUMNS.caixa)),
      deltaCaixa: parseNumberPtBr(get(SALDO_COLUMNS.deltaCaixa)),
      compromissoTotal: parseNumberPtBr(get(SALDO_COLUMNS.compromissoTotal)),
      compromissoValido: parseNumberPtBr(get(SALDO_COLUMNS.compromissoValido)),
      saldoDisponivel: parseNumberPtBr(get(SALDO_COLUMNS.saldoDisponivel)),
      ultimaDataCompromisso: parseDateLoose(get(SALDO_COLUMNS.ultimaDataCompromisso)),
      flagSaldo: get(SALDO_COLUMNS.flagSaldo).toLowerCase().includes("saldo"),
      saldoPotencial: parseNumberPtBr(get(SALDO_COLUMNS.saldoPotencial)),
    });
  }

  if (!linhas.length) throw new Error("Saldo_Projetos.csv: nenhuma linha válida.");
  if (dataReferencia === null) throw new Error("Saldo_Projetos.csv: Data_Referencia vazia ou inválida.");

  const yearCounts = new Map<number, number>();
  for (const linha of linhas) yearCounts.set(linha.ano, (yearCounts.get(linha.ano) ?? 0) + 1);
  const exerciseYear = [...yearCounts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];

  const anosNaFonte = [...new Set(linhas.map((linha) => linha.ano))].sort((a, b) => a - b);
  const anoReferencia = Number(dataReferencia.slice(0, 4));
  const yearGuard = {
    ok: anosNaFonte.length === 1 && anosNaFonte[0] === anoReferencia,
    anosNaFonte,
    anoReferencia,
  };

  const identityErrorsAll: SaldoIdentityError[] = [];
  for (const linha of linhas) {
    const expectedEmitir = linha.orcamento - linha.caixa - linha.compromissoValido;
    if (Math.abs(expectedEmitir - linha.saldoDisponivel) > SALDO_IDENTITY_TOLERANCE) {
      identityErrorsAll.push({
        projectKey: linha.projectKey,
        rubrica: linha.rubrica,
        rule: "A_EMITIR_VALIDO",
        expected: expectedEmitir,
        actual: linha.saldoDisponivel,
      });
    }
    const expectedSaldo = linha.flagSaldo && linha.saldoDisponivel > SALDO_BI_RULES.corteValorSaldo
      ? linha.saldoDisponivel
      : 0;
    if (Math.abs(expectedSaldo - linha.saldoPotencial) > SALDO_IDENTITY_TOLERANCE) {
      identityErrorsAll.push({
        projectKey: linha.projectKey,
        rubrica: linha.rubrica,
        rule: "VALOR_SALDO",
        expected: expectedSaldo,
        actual: linha.saldoPotencial,
      });
    }
  }
  const identityErrors = [...identityErrorsAll]
    .sort((a, b) => Math.abs(b.expected - b.actual) - Math.abs(a.expected - a.actual))
    .slice(0, MAX_IDENTITY_ERRORS);

  const exercicio = linhas.filter((linha) => linha.ano === exerciseYear);
  const projetosCarteira = input.projetos;

  const checks = [
    buildCheck(
      "orcamento",
      sumBy(exercicio, (linha) => linha.orcamento),
      sumBy(projetosCarteira, (projeto) => projeto.orcamento2026 ?? 0),
    ),
    buildCheck(
      "caixa",
      sumBy(exercicio, (linha) => linha.caixa),
      sumBy(projetosCarteira, (projeto) => (projeto.realizado2026 ?? 0) + (projeto.emPagamento2026 ?? 0)),
    ),
  ];
  const warnings = [
    buildCheck(
      "compromisso",
      sumBy(exercicio, (linha) => linha.compromissoTotal),
      sumBy(projetosCarteira, (projeto) => projeto.compromisso ?? 0),
    ),
  ];

  const carteiraIds = new Set(projetosCarteira.map((projeto) => projeto.id));
  const orfas = linhas.filter((linha) => !carteiraIds.has(linha.projectKey));
  const orphanKeys = [...new Set(orfas.map((linha) => linha.projectKey))].sort();
  const orphanProjects = {
    count: orphanKeys.length,
    saldoDisponivel: sumBy(orfas, (linha) => linha.saldoDisponivel),
    keys: orphanKeys,
  };

  const totals: SaldoTotals = {
    orcamento: sumBy(exercicio, (linha) => linha.orcamento),
    caixa: sumBy(exercicio, (linha) => linha.caixa),
    deltaCaixa: sumBy(exercicio, (linha) => linha.deltaCaixa),
    compromissoTotal: sumBy(exercicio, (linha) => linha.compromissoTotal),
    compromissoValido: sumBy(exercicio, (linha) => linha.compromissoValido),
    compromissoLegado: sumBy(exercicio, (linha) => linha.compromissoTotal)
      - sumBy(exercicio, (linha) => linha.compromissoValido),
    saldoDisponivel: sumBy(exercicio, (linha) => linha.saldoDisponivel),
    saldoPotencial: sumBy(exercicio, (linha) => linha.saldoPotencial),
    projetos: new Set(exercicio.map((linha) => linha.projectKey)).size,
    projetosComSaldo: new Set(
      exercicio.filter((linha) => linha.saldoPotencial > 0).map((linha) => linha.projectKey),
    ).size,
  };

  return {
    schemaVersion: 1,
    generatedFrom: "Saldo_Projetos.csv",
    generatedAt: input.generatedAt,
    exerciseYear,
    dataReferencia,
    linhas,
    totals,
    reconciliation: {
      ok: checks.every((check) => check.ok)
        && identityErrorsAll.length === 0
        && yearGuard.ok,
      checks,
      warnings,
      identityErrors,
      yearGuard,
      orphanProjects,
    },
    discardedLines,
  };
}
