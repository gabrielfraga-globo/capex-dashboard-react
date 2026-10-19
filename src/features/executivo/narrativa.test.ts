import { describe, expect, it } from "vitest";
import { buildKpisExecutivos } from "./kpis";
import { buildNarrativaExecutiva, buildNarrativaRisco } from "./narrativa";
import type { PressaoFolga } from "../saldo/saldo";
import type { KpisExecutivos } from "./types";

const base = (over: Partial<KpisExecutivos> = {}): KpisExecutivos => ({
  orcamento: 145_150_601,
  caixa: 88_997_307,
  emPagamento: 8_997_307,
  pctCaixa: 88_997_307 / 145_150_601,
  desvioPlano: null,
  compromissoTotal: 62_630_086,
  comprometido: 151_627_393,
  pctComprometido: 151_627_393 / 145_150_601,
  excesso: 6_476_792,
  excessoSemLegado: 4_461_848,
  folgaParada: 3_114_976,
  projetosParados: 7,
  ...over,
});

const pressao = (over: Partial<PressaoFolga> = {}): PressaoFolga => ({
  pressao: 0,
  projetosPressao: 0,
  maiorRubricaPressao: null,
  folgaParada: 0,
  projetosParados: 0,
  cobertura: null,
  ...over,
});

const PROIBIDOS = /null|NaN|undefined/;

describe("buildNarrativaExecutiva", () => {
  it("caso real com excesso e cobertura parcial", () => {
    expect(buildNarrativaExecutiva(base())).toBe(
      "Caixa em 61,3% do orçamento. O comprometido passa o orçamento em R$ 6,5M; R$ 3,1M parados há 6+ meses cobrem 48,1% disso.",
    );
  });

  it("cobertura ≥ 100% diz que cobrem todo o excesso", () => {
    const texto = buildNarrativaExecutiva(base({ folgaParada: 7_000_000 }));
    expect(texto).toContain("R$ 7M parados há 6+ meses cobrem todo o excesso.");
    expect(texto).not.toContain("cobrem 1");
    expect(texto).not.toContain("disso");
  });

  it("sem excesso fala do percentual comprometido e da folga", () => {
    const texto = buildNarrativaExecutiva(
      base({ excesso: 0, pctComprometido: 0.95, folgaParada: 2_000_000 }),
    );
    expect(texto).toBe(
      "Caixa em 61,3% do orçamento. O comprometido está em 95,0% do orçamento e há R$ 2M parados para remanejar.",
    );
  });

  it("sem excesso e sem folga mostra só o percentual comprometido", () => {
    const texto = buildNarrativaExecutiva(base({ excesso: 0, pctComprometido: 0.95, folgaParada: 0 }));
    expect(texto).toBe("Caixa em 61,3% do orçamento. O comprometido está em 95,0% do orçamento.");
  });

  it("desvioPlano null não menciona o plano", () => {
    expect(buildNarrativaExecutiva(base({ desvioPlano: null }))).not.toContain("plano");
  });

  it("|desvio| abaixo de R$ 100 mil não menciona o plano", () => {
    expect(buildNarrativaExecutiva(base({ desvioPlano: 50_000 }))).not.toContain("plano");
    expect(buildNarrativaExecutiva(base({ desvioPlano: -99_999 }))).not.toContain("plano");
  });

  it("desvio relevante indica à frente ou atrás do plano", () => {
    expect(buildNarrativaExecutiva(base({ desvioPlano: 1_500_000 }))).toContain(
      "Caixa em 61,3% do orçamento e R$ 1,5M à frente do plano.",
    );
    expect(buildNarrativaExecutiva(base({ desvioPlano: -1_200_000 }))).toContain(
      "Caixa em 61,3% do orçamento e R$ 1,2M atrás do plano.",
    );
  });

  it("pctCaixa null omite a primeira frase sem vazar texto nulo", () => {
    const k = buildKpisExecutivos({
      lista: [{ orcamento2026: 0, realizado2026: 100, emPagamento2026: 0, compromisso: 50 }],
      planejadoAcumulado: null,
    });
    const texto = buildNarrativaExecutiva(k);
    expect(texto).toBe("O comprometido passa o orçamento em R$ 150.");
  });

  it("nenhuma saída contém null, NaN ou undefined", () => {
    const cenarios = [
      base(),
      base({ folgaParada: null, desvioPlano: null }),
      base({ excesso: 0, pctComprometido: null, folgaParada: 0 }),
      base({ excesso: 0, pctComprometido: null, folgaParada: 500_000 }),
      base({ pctCaixa: null, folgaParada: null, excesso: 0, pctComprometido: null }),
    ];
    for (const k of cenarios) {
      expect(buildNarrativaExecutiva(k)).not.toMatch(PROIBIDOS);
    }
  });
});

describe("buildNarrativaRisco", () => {
  it("sem pressão, com folga, usa plural", () => {
    expect(buildNarrativaRisco(pressao({ folgaParada: 2_000_000, projetosParados: 3 }))).toBe(
      "Nenhum projeto comprometido acima do orçamento; R$ 2M parados em 3 projetos podem ser remanejados.",
    );
  });

  it("sem pressão e sem folga", () => {
    expect(buildNarrativaRisco(pressao())).toBe("Nenhum projeto comprometido acima do orçamento.");
  });

  it("com pressão e folga, usa plural e cobertura", () => {
    expect(
      buildNarrativaRisco(
        pressao({
          pressao: 2_000_000,
          projetosPressao: 2,
          folgaParada: 500_000,
          projetosParados: 4,
          cobertura: 0.25,
        }),
      ),
    ).toBe(
      "R$ 2M comprometidos acima do orçamento em 2 projetos. R$ 500K parados em 4 projetos cobrem 25,0% dessa pressão.",
    );
  });

  it("com pressão e sem folga", () => {
    expect(
      buildNarrativaRisco(pressao({ pressao: 1_000_000, projetosPressao: 1, folgaParada: 0, cobertura: 0 })),
    ).toBe("R$ 1M comprometidos acima do orçamento em 1 projeto.");
  });

  it("singular para 1 projeto nas duas partes", () => {
    const texto = buildNarrativaRisco(
      pressao({ pressao: 1_200_000, projetosPressao: 1, folgaParada: 600_000, projetosParados: 1, cobertura: 0.5 }),
    );
    expect(texto).toContain("em 1 projeto.");
    expect(texto).toContain("em 1 projeto cobrem 50,0%");
    expect(texto).not.toContain("projetos");
  });

  it("nenhuma saída contém null, NaN ou undefined", () => {
    const cenarios = [
      pressao(),
      pressao({ folgaParada: 1_000_000, projetosParados: 2 }),
      pressao({ pressao: 1_000_000, projetosPressao: 1, folgaParada: 0, cobertura: 0 }),
      pressao({ pressao: 1_000_000, projetosPressao: 1, folgaParada: 300_000, projetosParados: 1, cobertura: 0.3 }),
    ];
    for (const p of cenarios) {
      expect(buildNarrativaRisco(p)).not.toMatch(PROIBIDOS);
    }
  });

  it("cobertura ≥ 100% diz que cobrem toda a pressão, sem percentual", () => {
    const texto = buildNarrativaRisco(
      pressao({ pressao: 1_000_000, projetosPressao: 1, folgaParada: 3_000_000, projetosParados: 2, cobertura: 3 }),
    );
    expect(texto).toContain("cobrem toda essa pressão");
    expect(texto).not.toContain("%");
  });
});
