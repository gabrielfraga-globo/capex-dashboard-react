import { describe, expect, it } from "vitest";
import type { ProjetoBase } from "../../types";
import { LIMIAR_MATERIALIDADE } from "../../lib/metrics";
import type { SaldoRecorteView } from "../radar/types";
import { SALDO_SIGNAL_TOLERANCE } from "./saldoConfig";
import {
  buildNarrativaPlurianual,
  buildPlurianualViews,
  nivelEstouro,
  resumoPlurianual,
} from "./plurianual";

type RubricaEntry = ProjetoBase["porRubrica"][string];

function mkRubrica(parcial: Partial<RubricaEntry> = {}): RubricaEntry {
  return {
    orcamento2026: 0,
    orcamento2027: 0,
    realizado2026: 0,
    emPagamento2026: 0,
    realizado2027: 0,
    emPagamento2027: 0,
    compromisso: 0,
    meses2026: Array(12).fill(0),
    meses2027: Array(3).fill(0),
    executadoMensal2026: Array(12).fill(0),
    ...parcial,
  };
}

function mkProjeto(parcial: Partial<ProjetoBase> = {}): ProjetoBase {
  return {
    id: "n4a|lb a",
    nome: "LB A",
    n4: "N4 A",
    n4Curta: "A",
    gestor: null,
    gestorEmail: null,
    aprovador: "Aprovador A",
    orcamentoPlurianual: 0,
    orcamento2026: null,
    orcamento2027: null,
    h1_2026: null,
    h2_2026: null,
    meses2026: null,
    meses2027: null,
    executadoMensal2026: null,
    realizado2026: 0,
    emPagamento2026: 0,
    realizado2027: 0,
    emPagamento2027: 0,
    compromisso: 0,
    aEmitirFonte: null,
    deltaCaixaFonte: null,
    origemOrcamento: true,
    origemRealizado: true,
    porRubrica: {},
    ...parcial,
  };
}

function mkView(parcial: Partial<SaldoRecorteView>): SaldoRecorteView {
  return {
    key: "k",
    label: "k",
    aprovador: null,
    orcamento: 0,
    caixa: 0,
    deltaCaixa: 0,
    compromissoTotal: 0,
    compromissoValido: 0,
    compromissoLegado: 0,
    saldoDisponivel: 0,
    saldoPotencial: 0,
    projetos: 1,
    projetosComSaldo: 0,
    ultimaDataCompromisso: null,
    linhasComFlag: 0,
    pctCaixa: null,
    pctSaldo: null,
    signal: "EM_EXECUCAO",
    ...parcial,
  };
}

const TOL = SALDO_SIGNAL_TOLERANCE;

describe("nivelEstouro", () => {
  it("classifica estouro de caixa, comprometido acima e OK", () => {
    expect(nivelEstouro({ orcamento: 100_000, caixa: 250_000, compromissoTotal: 0 })).toBe("ESTOURO_CAIXA");
    expect(nivelEstouro({ orcamento: 100_000, caixa: 60_000, compromissoTotal: 60_000 })).toBe("COMPROMETIDO_ACIMA");
    expect(nivelEstouro({ orcamento: 100_000, caixa: 60_000, compromissoTotal: 20_000 })).toBe("OK");
  });

  it("caixa 50 mil acima do orçamento é COMPROMETIDO_ACIMA, não ESTOURO_CAIXA", () => {
    expect(nivelEstouro({ orcamento: 100_000, caixa: 150_000, compromissoTotal: 0 })).toBe("COMPROMETIDO_ACIMA");
  });

  it("estouro de caixa usa materialidade de R$ 100 mil (estrita: > limiar)", () => {
    expect(nivelEstouro({ orcamento: 100_000, caixa: 100_000 + LIMIAR_MATERIALIDADE, compromissoTotal: 0 })).toBe("COMPROMETIDO_ACIMA");
    expect(nivelEstouro({ orcamento: 100_000, caixa: 100_000 + LIMIAR_MATERIALIDADE + 1, compromissoTotal: 0 })).toBe("ESTOURO_CAIXA");
  });

  it("comprometido acima respeita a tolerância de sinal (estrita: > tol)", () => {
    expect(nivelEstouro({ orcamento: 100_000, caixa: 50_000, compromissoTotal: 50_000 + TOL })).toBe("OK");
    expect(nivelEstouro({ orcamento: 100_000, caixa: 50_000, compromissoTotal: 50_000 + TOL + 1 })).toBe("COMPROMETIDO_ACIMA");
  });
});

describe("buildPlurianualViews", () => {
  const projetoA = mkProjeto({
    id: "a|lb a",
    nome: "LB A",
    orcamentoPlurianual: 1_000_000,
    realizado2026: 100_000,
    emPagamento2026: 20_000,
    realizado2027: 300_000,
    emPagamento2027: 10_000,
    compromisso: 200_000,
    porRubrica: {
      R1: mkRubrica({ orcamento2026: 400_000, orcamento2027: 100_000, realizado2026: 100_000, emPagamento2026: 20_000, realizado2027: 300_000, emPagamento2027: 10_000, compromisso: 200_000 }),
      R2: mkRubrica({ orcamento2026: 500_000, orcamento2027: 0 }),
    },
  });

  it("sem rubrica usa orcamentoPlurianual e soma caixa dos 2 anos", () => {
    const { porProjeto, totals } = buildPlurianualViews([projetoA]);
    expect(porProjeto).toHaveLength(1);
    const v = porProjeto[0];
    expect(v.orcamento).toBe(1_000_000);
    expect(v.caixa).toBe(430_000);
    expect(v.compromissoTotal).toBe(200_000);
    expect(v.compromissoValido).toBe(200_000);
    expect(v.compromissoLegado).toBe(0);
    expect(v.saldoDisponivel).toBe(370_000);
    expect(v.key).toBe("a|lb a");
    expect(v.label).toBe("LB A");
    expect(v.aprovador).toBe("Aprovador A");
    expect(totals.orcamento).toBe(1_000_000);
  });

  it("sem rubrica ignora a soma das rubricas quando orcamentoPlurianual difere", () => {
    const { porProjeto } = buildPlurianualViews([projetoA]);
    expect(porProjeto[0].orcamento).toBe(1_000_000);
  });

  it("com rubricas soma só as selecionadas", () => {
    const { porProjeto } = buildPlurianualViews([projetoA], { rubricas: ["R1"] });
    const v = porProjeto[0];
    expect(v.orcamento).toBe(500_000);
    expect(v.caixa).toBe(430_000);
    expect(v.compromissoTotal).toBe(200_000);
    expect(v.saldoDisponivel).toBe(500_000 - 430_000 - 200_000);
  });

  it("projeto com compromisso em rubrica selecionada e sem orçamento nela entra com orcamento 0", () => {
    const projetoB = mkProjeto({
      id: "b|lb b",
      nome: "LB B",
      orcamentoPlurianual: 0,
      porRubrica: { R3: mkRubrica({ compromisso: 80_000 }) },
    });
    const { porProjeto } = buildPlurianualViews([projetoA, projetoB], { rubricas: ["R3"] });
    expect(porProjeto).toHaveLength(1);
    expect(porProjeto[0].key).toBe("b|lb b");
    expect(porProjeto[0].orcamento).toBe(0);
    expect(porProjeto[0].compromissoTotal).toBe(80_000);
    expect(porProjeto[0].saldoDisponivel).toBe(-80_000);
  });

  it("projeto sem valor nas rubricas selecionadas fica fora", () => {
    const { porProjeto } = buildPlurianualViews([projetoA], { rubricas: ["R9"] });
    expect(porProjeto).toHaveLength(0);
  });

  it("porRubrica agrega todas as rubricas dos projetos", () => {
    const projetoB = mkProjeto({ id: "b|lb b", porRubrica: { R1: mkRubrica({ orcamento2026: 50_000, compromisso: 10_000 }) } });
    const { porRubrica } = buildPlurianualViews([projetoA, projetoB]);
    const r1 = porRubrica.find((v) => v.key === "R1");
    expect(r1?.orcamento).toBe(550_000);
    expect(r1?.compromissoTotal).toBe(210_000);
    expect(r1?.projetos).toBe(2);
    expect(porRubrica.find((v) => v.key === "R2")?.orcamento).toBe(500_000);
  });

  it("saldoPotencial e ultimaDataCompromisso vêm do saldoBI pelo mesmo key", () => {
    const bi: SaldoRecorteView[] = [
      mkView({ key: "a|lb a", saldoPotencial: 75_000, ultimaDataCompromisso: "2025-01-10" }),
    ];
    const projetoC = mkProjeto({ id: "c|lb c", orcamentoPlurianual: 10 });
    const { porProjeto, totals } = buildPlurianualViews([projetoA, projetoC], { saldoBI: bi });
    const a = porProjeto.find((v) => v.key === "a|lb a");
    const c = porProjeto.find((v) => v.key === "c|lb c");
    expect(a?.saldoPotencial).toBe(75_000);
    expect(a?.ultimaDataCompromisso).toBe("2025-01-10");
    expect(c?.saldoPotencial).toBe(0);
    expect(c?.ultimaDataCompromisso).toBeNull();
    expect(totals.saldoPotencial).toBe(75_000);
    expect(totals.projetosComSaldo).toBe(1);
  });

  it("null em campos de origem conta como 0", () => {
    const p = mkProjeto({ id: "n|lb n", orcamentoPlurianual: null, realizado2026: null, compromisso: null });
    const { porProjeto } = buildPlurianualViews([p]);
    expect(porProjeto[0].orcamento).toBe(0);
    expect(porProjeto[0].caixa).toBe(0);
    expect(porProjeto[0].compromissoTotal).toBe(0);
  });
});

describe("resumoPlurianual e invariante do Estouro", () => {
  it("separa estouro de caixa e comprometido acima e soma a folga parada", () => {
    const views = [
      mkView({ key: "e", orcamento: 100_000, caixa: 250_000, compromissoTotal: 0, saldoPotencial: 0 }),
      mkView({ key: "c", orcamento: 100_000, caixa: 60_000, compromissoTotal: 60_000, saldoPotencial: 10_000 }),
      mkView({ key: "o", orcamento: 100_000, caixa: 10_000, compromissoTotal: 10_000, saldoPotencial: 30_000 }),
    ];
    expect(resumoPlurianual(views)).toEqual({
      estouroCaixa: 150_000,
      nEstouro: 1,
      comprometidoAcima: 20_000,
      nComprometido: 1,
      folgaParada: 40_000,
      nParados: 2,
    });
  });

  it("nEstouro == nº de projetos com (realizado+emPgto 2026+2027) − orcamentoPlurianual > R$ 100 mil", () => {
    const projetos = [
      mkProjeto({ id: "p1|x", orcamentoPlurianual: 100_000, realizado2026: 100_000 + LIMIAR_MATERIALIDADE + 1 }),
      mkProjeto({ id: "p2|x", orcamentoPlurianual: 100_000, realizado2026: 100_000 + LIMIAR_MATERIALIDADE }),
      mkProjeto({ id: "p3|x", orcamentoPlurianual: 50_000, realizado2027: 30_000, emPagamento2027: 140_000 }),
      mkProjeto({ id: "p4|x", orcamentoPlurianual: 10_000, emPagamento2026: 5_000, compromisso: 500_000 }),
      mkProjeto({ id: "p5|x", orcamentoPlurianual: 200_000, realizado2026: 20_000, emPagamento2027: 180_000 }),
      mkProjeto({ id: "p6|x", orcamentoPlurianual: 100_000, realizado2026: 150_000 }),
    ];
    const esperado = projetos.filter((p) => {
      const exec = (p.realizado2026 ?? 0) + (p.emPagamento2026 ?? 0) + (p.realizado2027 ?? 0) + (p.emPagamento2027 ?? 0);
      return exec - (p.orcamentoPlurianual ?? 0) > LIMIAR_MATERIALIDADE;
    }).length;
    const { porProjeto } = buildPlurianualViews(projetos);
    const r = resumoPlurianual(porProjeto);
    expect(esperado).toBe(2);
    expect(r.nEstouro).toBe(esperado);
  });
});

describe("buildNarrativaPlurianual", () => {
  const base = { estouroCaixa: 0, nEstouro: 0, comprometidoAcima: 0, nComprometido: 0, folgaParada: 0, nParados: 0 };

  it("tudo zero → mensagem de nenhum estouro", () => {
    expect(buildNarrativaPlurianual(base)).toBe("Nenhum projeto acima do orçamento plurianual.");
  });

  it("singular de estouro, sem comprometido e sem folga", () => {
    const txt = buildNarrativaPlurianual({ ...base, nEstouro: 1, estouroCaixa: 10_000 });
    expect(txt).toBe("1 projeto com caixa acima do orçamento plurianual (R$ 10K).");
  });

  it("plural completo com folga", () => {
    const txt = buildNarrativaPlurianual({
      estouroCaixa: 2_500_000,
      nEstouro: 2,
      comprometidoAcima: 1_000_000,
      nComprometido: 3,
      folgaParada: 500_000,
      nParados: 4,
    });
    expect(txt).toBe(
      "2 projetos com caixa acima do orçamento plurianual (R$ 2,5M) e 3 projetos com o comprometido acima (R$ 1M). R$ 500K parados há 6+ meses em 2026 podem ser remanejados.",
    );
  });

  it("só comprometido no singular, omite partes zeradas", () => {
    const txt = buildNarrativaPlurianual({ ...base, nComprometido: 1, comprometidoAcima: 40_000 });
    expect(txt).toBe("1 projeto com o comprometido acima (R$ 40K).");
  });

  it("só folga parada", () => {
    const txt = buildNarrativaPlurianual({ ...base, folgaParada: 120_000, nParados: 1 });
    expect(txt).toBe("R$ 120K parados há 6+ meses em 2026 podem ser remanejados.");
  });

  it("nunca contém null, NaN ou undefined", () => {
    const txt = buildNarrativaPlurianual({ ...base, nEstouro: 1, estouroCaixa: 1, folgaParada: 1, nParados: 1 });
    expect(txt).not.toMatch(/null|NaN|undefined/);
  });
});
