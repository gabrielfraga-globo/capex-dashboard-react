import type { SaldoProjetoLinha, SaldoRecorteView, SaldoSignal, SaldoTotals } from "../radar/types";
import { normalizeKey } from "../../lib/csvProcessingCore";
import { SALDO_SIGNAL_TOLERANCE } from "./saldoConfig";

export interface SaldoFiltro {
  projectKeys?: ReadonlySet<string>;
  rubricas?: string[];
  n4?: string | null;
  aprovador?: string | null;
  busca?: string;
}

export type SaldoBridgeStep = {
  label: string;
  value: number;
  kind: "base" | "minus" | "result" | "sub";
};

function totalsOf(linhas: readonly SaldoProjetoLinha[]): SaldoTotals {
  let orcamento = 0;
  let caixa = 0;
  let deltaCaixa = 0;
  let compromissoTotal = 0;
  let compromissoValido = 0;
  let saldoDisponivel = 0;
  let saldoPotencial = 0;
  const projetos = new Set<string>();
  const projetosComSaldo = new Set<string>();

  for (const l of linhas) {
    orcamento += l.orcamento;
    caixa += l.caixa;
    deltaCaixa += l.deltaCaixa;
    compromissoTotal += l.compromissoTotal;
    compromissoValido += l.compromissoValido;
    saldoDisponivel += l.saldoDisponivel;
    saldoPotencial += l.saldoPotencial;
    projetos.add(l.projectKey);
    if (l.saldoPotencial > 0) projetosComSaldo.add(l.projectKey);
  }

  return {
    orcamento,
    caixa,
    deltaCaixa,
    compromissoTotal,
    compromissoValido,
    compromissoLegado: compromissoTotal - compromissoValido,
    saldoDisponivel,
    saldoPotencial,
    projetos: projetos.size,
    projetosComSaldo: projetosComSaldo.size,
  };
}

export function filterSaldoLinhas(linhas: readonly SaldoProjetoLinha[], f: SaldoFiltro): SaldoProjetoLinha[] {
  const n4Key = f.n4 != null ? normalizeKey(f.n4) : null;
  const aprovadorKey = f.aprovador != null ? normalizeKey(f.aprovador) : null;
  const buscaKey = f.busca !== undefined ? normalizeKey(f.busca) : "";
  const rubricas = f.rubricas && f.rubricas.length > 0 ? new Set(f.rubricas) : null;

  return linhas.filter((l) => {
    if (f.projectKeys && !f.projectKeys.has(l.projectKey)) return false;
    if (rubricas && !rubricas.has(l.rubrica)) return false;
    if (n4Key !== null && normalizeKey(l.n4) !== n4Key) return false;
    if (aprovadorKey !== null && normalizeKey(l.aprovador) !== aprovadorKey) return false;
    if (buscaKey && !normalizeKey(l.nomeLB).includes(buscaKey) && !normalizeKey(l.aprovador).includes(buscaKey)) {
      return false;
    }
    return true;
  });
}

export function summarizeSaldo(linhas: readonly SaldoProjetoLinha[]): SaldoTotals {
  return totalsOf(linhas);
}

export function classifySaldo(t: SaldoTotals & { linhasComFlag: number }): SaldoSignal {
  const tol = SALDO_SIGNAL_TOLERANCE;
  if (t.deltaCaixa < -tol) return "ESTOURO_CAIXA";
  if (t.orcamento === 0) return "SEM_ORCAMENTO";
  if (t.saldoDisponivel < -tol) return "COMPROMETIDO_ACIMA";
  if (t.saldoPotencial > 0) return "SALDO_PARADO";
  if (t.linhasComFlag > 0) return "SALDO_RESIDUAL";
  return "EM_EXECUCAO";
}

export function aggregateSaldoBy(linhas: readonly SaldoProjetoLinha[], dim: "projeto" | "rubrica"): SaldoRecorteView[] {
  const groups = new Map<string, SaldoProjetoLinha[]>();
  for (const l of linhas) {
    const key = dim === "projeto" ? l.projectKey : l.rubrica;
    const bucket = groups.get(key);
    if (bucket) bucket.push(l);
    else groups.set(key, [l]);
  }

  const views: SaldoRecorteView[] = [];
  for (const [key, rows] of groups) {
    const totals = totalsOf(rows);
    const linhasComFlag = rows.filter((r) => r.flagSaldo).length;
    let ultimaDataCompromisso: string | null = null;
    for (const r of rows) {
      if (r.ultimaDataCompromisso && (ultimaDataCompromisso === null || r.ultimaDataCompromisso > ultimaDataCompromisso)) {
        ultimaDataCompromisso = r.ultimaDataCompromisso;
      }
    }
    const aprovador = dim === "projeto" ? (rows.find((r) => r.aprovador !== null)?.aprovador ?? null) : null;
    const orcamento = totals.orcamento;

    views.push({
      ...totals,
      key,
      label: dim === "projeto" ? rows[0].nomeLB : key,
      aprovador,
      ultimaDataCompromisso,
      linhasComFlag,
      pctCaixa: orcamento === 0 ? null : totals.caixa / orcamento,
      pctSaldo: orcamento === 0 ? null : totals.saldoDisponivel / orcamento,
      signal: classifySaldo({ ...totals, linhasComFlag }),
    });
  }

  return views.sort((a, b) => b.saldoPotencial - a.saldoPotencial || b.saldoDisponivel - a.saldoDisponivel);
}

/** Maior data de compromisso considerando só linhas com saldo parado (saldoPotencial > 0); null se nenhuma tiver data. */
export function ultimaDataParadaPorProjeto(linhas: readonly SaldoProjetoLinha[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const l of linhas) {
    if (!(l.saldoPotencial > 0)) continue;
    const atual = out.get(l.projectKey) ?? null;
    const candidata = l.ultimaDataCompromisso;
    out.set(l.projectKey, candidata && (atual === null || candidata > atual) ? candidata : atual);
  }
  return out;
}

/** Saldo com compromisso TOTAL (decisão D1): orçamento − caixa − compromisso total. */
export function saldoTotalDe(t: Pick<SaldoTotals, "orcamento" | "caixa" | "compromissoTotal">): number {
  return t.orcamento - t.caixa - t.compromissoTotal;
}

export interface PressaoFolga {
  pressao: number;
  projetosPressao: number;
  maiorRubricaPressao: string | null;
  folgaParada: number;
  projetosParados: number;
  cobertura: number | null;
}

export function splitPressaoFolga(
  porProjeto: readonly SaldoRecorteView[],
  porRubrica: readonly SaldoRecorteView[],
): PressaoFolga {
  const tol = SALDO_SIGNAL_TOLERANCE;
  let pressao = 0;
  let projetosPressao = 0;
  let folgaParada = 0;
  let projetosParados = 0;

  for (const v of porProjeto) {
    const total = saldoTotalDe(v);
    if (total < -tol) {
      pressao += -total;
      projetosPressao += 1;
    }
    folgaParada += v.saldoPotencial;
    if (v.saldoPotencial > 0) projetosParados += 1;
  }

  let maiorRubricaPressao: string | null = null;
  let piorTotal = -tol;
  for (const v of porRubrica) {
    const total = saldoTotalDe(v);
    if (total < piorTotal) {
      piorTotal = total;
      maiorRubricaPressao = v.key;
    }
  }

  return {
    pressao,
    projetosPressao,
    maiorRubricaPressao,
    folgaParada,
    projetosParados,
    cobertura: pressao > 0 ? folgaParada / pressao : null,
  };
}

export function buildSaldoBridge(t: SaldoTotals, opts?: { incluirLegado?: boolean }): SaldoBridgeStep[] {
  const passos: SaldoBridgeStep[] = [
    { label: "Orçamento", value: t.orcamento, kind: "base" },
    { label: "Caixa do exercício", value: t.caixa, kind: "minus" },
    { label: "Delta de caixa", value: t.deltaCaixa, kind: "result" },
    { label: "Compromisso válido", value: t.compromissoValido, kind: "minus" },
    { label: opts?.incluirLegado ? "Saldo disponível (BI)" : "Saldo disponível", value: t.saldoDisponivel, kind: "result" },
  ];

  if (opts?.incluirLegado) {
    passos.push(
      { label: "Compromisso legado (premissa)", value: t.compromissoLegado, kind: "minus" },
      { label: "Saldo com compromisso total", value: saldoTotalDe(t), kind: "result" },
    );
  }

  passos.push({ label: "Saldo potencial (parado 6m+)", value: t.saldoPotencial, kind: "sub" });
  return passos;
}

function parseYmd(iso: string): [number, number, number] {
  return [Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))];
}

export function mesesDesde(isoDate: string | null, dataReferencia: string): number | null {
  if (isoDate === null) return null;
  const [ano, mes, dia] = parseYmd(isoDate);
  const [anoRef, mesRef, diaRef] = parseYmd(dataReferencia);
  return (anoRef - ano) * 12 + (mesRef - mes) - (diaRef < dia ? 1 : 0);
}

export function topBySaldoPotencial(views: readonly SaldoRecorteView[], n: number): SaldoRecorteView[] {
  return views
    .filter((v) => v.saldoPotencial > 0)
    .sort((a, b) => b.saldoPotencial - a.saldoPotencial)
    .slice(0, Math.max(0, n));
}
