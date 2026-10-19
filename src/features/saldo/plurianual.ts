import type { ProjetoBase } from "../../types";
import { fmtBRL } from "../../lib/format";
import type { SaldoRecorteView, SaldoTotals } from "../radar/types";
import { classifySaldo } from "./saldo";
import { SALDO_SIGNAL_TOLERANCE } from "./saldoConfig";

type RubricaEntry = ProjetoBase["porRubrica"][string];

export interface PlurianualOpts {
  rubricas?: string[];
  saldoBI?: SaldoRecorteView[] | null;
}

export interface PlurianualViews {
  porProjeto: SaldoRecorteView[];
  porRubrica: SaldoRecorteView[];
  totals: SaldoTotals;
}

export type NivelEstouro = "ESTOURO_CAIXA" | "COMPROMETIDO_ACIMA" | "OK";

export interface ResumoPlurianual {
  estouroCaixa: number;
  nEstouro: number;
  comprometidoAcima: number;
  nComprometido: number;
  folgaParada: number;
  nParados: number;
}

interface Valores {
  orcamento: number;
  caixa: number;
  compromisso: number;
}

function valoresDe(src: {
  orcamento: number;
  realizado26: number;
  em26: number;
  realizado27: number;
  em27: number;
  compromisso: number;
}): Valores {
  return {
    orcamento: src.orcamento,
    caixa: src.realizado26 + src.em26 + src.realizado27 + src.em27,
    compromisso: src.compromisso,
  };
}

function valoresDeRubrica(e: RubricaEntry): Valores {
  return valoresDe({
    orcamento: e.orcamento2026 + e.orcamento2027,
    realizado26: e.realizado2026,
    em26: e.emPagamento2026,
    realizado27: e.realizado2027,
    em27: e.emPagamento2027,
    compromisso: e.compromisso,
  });
}

function temValor(v: Valores): boolean {
  return v.orcamento !== 0 || v.caixa !== 0 || v.compromisso !== 0;
}

function valoresDoProjeto(p: ProjetoBase, rubricas: readonly string[] | undefined): Valores {
  if (!rubricas) {
    return valoresDe({
      orcamento: p.orcamentoPlurianual ?? 0,
      realizado26: p.realizado2026 ?? 0,
      em26: p.emPagamento2026 ?? 0,
      realizado27: p.realizado2027 ?? 0,
      em27: p.emPagamento2027 ?? 0,
      compromisso: p.compromisso ?? 0,
    });
  }
  const acc: Valores = { orcamento: 0, caixa: 0, compromisso: 0 };
  for (const r of rubricas) {
    const e: RubricaEntry | undefined = p.porRubrica[r];
    if (!e) continue;
    const v = valoresDeRubrica(e);
    acc.orcamento += v.orcamento;
    acc.caixa += v.caixa;
    acc.compromisso += v.compromisso;
  }
  return acc;
}

function montarView(
  key: string,
  label: string,
  aprovador: string | null,
  v: Valores,
  projetos: number,
  bi: SaldoRecorteView | undefined,
): SaldoRecorteView {
  const orcamento = v.orcamento;
  const caixa = v.caixa;
  const compromissoTotal = v.compromisso;
  const saldoDisponivel = orcamento - caixa - compromissoTotal;
  const saldoPotencial = bi?.saldoPotencial ?? 0;
  const totals: SaldoTotals = {
    orcamento,
    caixa,
    deltaCaixa: orcamento - caixa,
    compromissoTotal,
    compromissoValido: compromissoTotal,
    compromissoLegado: 0,
    saldoDisponivel,
    saldoPotencial,
    projetos,
    projetosComSaldo: saldoPotencial > 0 ? 1 : 0,
  };
  return {
    ...totals,
    key,
    label,
    aprovador,
    ultimaDataCompromisso: bi?.ultimaDataCompromisso ?? null,
    linhasComFlag: 0,
    pctCaixa: orcamento === 0 ? null : caixa / orcamento,
    pctSaldo: orcamento === 0 ? null : saldoDisponivel / orcamento,
    signal: classifySaldo({ ...totals, linhasComFlag: 0 }),
  };
}

function ordenar(views: SaldoRecorteView[]): SaldoRecorteView[] {
  return views.sort((a, b) => b.saldoPotencial - a.saldoPotencial || b.saldoDisponivel - a.saldoDisponivel);
}

export function buildPlurianualViews(projetos: readonly ProjetoBase[], opts: PlurianualOpts = {}): PlurianualViews {
  const rubricas = opts.rubricas && opts.rubricas.length > 0 ? opts.rubricas : undefined;
  const biPorKey = new Map<string, SaldoRecorteView>();
  for (const v of opts.saldoBI ?? []) biPorKey.set(v.key, v);

  const porProjeto: SaldoRecorteView[] = [];
  for (const p of projetos) {
    const v = valoresDoProjeto(p, rubricas);
    if (rubricas && !temValor(v)) continue;
    porProjeto.push(montarView(p.id, p.nome, p.aprovador, v, 1, biPorKey.get(p.id)));
  }

  const acumRubrica = new Map<string, { v: Valores; projetos: number }>();
  for (const p of projetos) {
    for (const [rub, e] of Object.entries(p.porRubrica)) {
      const v = valoresDeRubrica(e);
      if (!temValor(v)) continue;
      const acc = acumRubrica.get(rub) ?? { v: { orcamento: 0, caixa: 0, compromisso: 0 }, projetos: 0 };
      acc.v.orcamento += v.orcamento;
      acc.v.caixa += v.caixa;
      acc.v.compromisso += v.compromisso;
      acc.projetos += 1;
      acumRubrica.set(rub, acc);
    }
  }
  const porRubrica = ordenar(
    [...acumRubrica].map(([rub, acc]) => montarView(rub, rub, null, acc.v, acc.projetos, biPorKey.get(rub))),
  );

  ordenar(porProjeto);
  const totals: SaldoTotals = {
    orcamento: 0,
    caixa: 0,
    deltaCaixa: 0,
    compromissoTotal: 0,
    compromissoValido: 0,
    compromissoLegado: 0,
    saldoDisponivel: 0,
    saldoPotencial: 0,
    projetos: porProjeto.length,
    projetosComSaldo: 0,
  };
  for (const v of porProjeto) {
    totals.orcamento += v.orcamento;
    totals.caixa += v.caixa;
    totals.deltaCaixa += v.deltaCaixa;
    totals.compromissoTotal += v.compromissoTotal;
    totals.compromissoValido += v.compromissoValido;
    totals.saldoDisponivel += v.saldoDisponivel;
    totals.saldoPotencial += v.saldoPotencial;
    totals.projetosComSaldo += v.projetosComSaldo;
  }

  return { porProjeto, porRubrica, totals };
}

export function nivelEstouro(v: Pick<SaldoRecorteView, "orcamento" | "caixa" | "compromissoTotal">): NivelEstouro {
  const tol = SALDO_SIGNAL_TOLERANCE;
  if (v.caixa - v.orcamento > tol) return "ESTOURO_CAIXA";
  if (v.caixa + v.compromissoTotal - v.orcamento > tol) return "COMPROMETIDO_ACIMA";
  return "OK";
}

export function resumoPlurianual(porProjeto: readonly SaldoRecorteView[]): ResumoPlurianual {
  const r: ResumoPlurianual = {
    estouroCaixa: 0,
    nEstouro: 0,
    comprometidoAcima: 0,
    nComprometido: 0,
    folgaParada: 0,
    nParados: 0,
  };
  for (const v of porProjeto) {
    const nivel = nivelEstouro(v);
    if (nivel === "ESTOURO_CAIXA") {
      r.estouroCaixa += v.caixa - v.orcamento;
      r.nEstouro += 1;
    } else if (nivel === "COMPROMETIDO_ACIMA") {
      r.comprometidoAcima += v.caixa + v.compromissoTotal - v.orcamento;
      r.nComprometido += 1;
    }
    r.folgaParada += v.saldoPotencial;
    if (v.saldoPotencial > 0) r.nParados += 1;
  }
  return r;
}

export function buildNarrativaPlurianual(r: ResumoPlurianual): string {
  const frases: string[] = [];
  const temEstouro = r.nEstouro > 0;
  const temComprometido = r.nComprometido > 0;
  const temFolga = r.folgaParada > 0;

  if (temEstouro || temComprometido) {
    const estouroTxt = `${r.nEstouro} ${r.nEstouro === 1 ? "projeto" : "projetos"} com caixa acima do orçamento plurianual (${fmtBRL(r.estouroCaixa, true)})`;
    const compTxt = `${r.nComprometido} ${r.nComprometido === 1 ? "projeto" : "projetos"} com o comprometido acima (${fmtBRL(r.comprometidoAcima, true)})`;
    if (temEstouro && temComprometido) frases.push(`${estouroTxt} e ${compTxt}.`);
    else if (temEstouro) frases.push(`${estouroTxt}.`);
    else frases.push(`${compTxt}.`);
  }

  if (temFolga) {
    frases.push(`${fmtBRL(r.folgaParada, true)} parados há 6+ meses em 2026 podem ser remanejados.`);
  }

  if (frases.length === 0) return "Nenhum projeto acima do orçamento plurianual.";
  return frases.join(" ");
}
