import { describe, expect, it } from "vitest";
import { buildTorre2026, buildTorre2027, conciliacaoEmitido } from "./torres";
import { LIMIAR_MATERIALIDADE } from "../../lib/metrics";

// 'excesso' é a parte de `ocupado` que passa da base (cauda visual), não consumo extra.
const somaSemFolga = (segs: { chave: string; valor: number }[]) =>
  segs.filter((s) => !["folga", "aContratar", "excesso"].includes(s.chave)).reduce((a, s) => a + s.valor, 0);

describe("buildTorre2026", () => {
  const real = { bg: 145_200_000, realizado: 81_800_000, emPagamento: 8_900_000, comp26: 51_700_000, emRisco: 37_100_000 };

  it("caso real: ocupa ~98,1% do BG com folga de ~2,8M", () => {
    const t = buildTorre2026(real);
    expect(t.ocupado).toBe(142_400_000);
    expect(t.pctOcupado).toBeCloseTo(0.981, 3);
    expect(t.folga).toBe(2_800_000);
    expect(t.excesso).toBe(0);
    expect(t.excessoMaterial).toBe(false);
    expect(t.segmentos.map((s) => s.chave)).toEqual(["realizado", "emPagamento", "comp26Firme", "comp26Risco", "folga"]);
  });

  it("soma dos segmentos sem folga = ocupado; folga + ocupado = base quando cabe", () => {
    const t = buildTorre2026(real);
    expect(somaSemFolga(t.segmentos)).toBe(t.ocupado);
    expect(t.folga + t.ocupado).toBe(t.base);
  });

  it("comp26Firme = comp26 − emRisco", () => {
    const t = buildTorre2026(real);
    expect(t.segmentos.find((s) => s.chave === "comp26Firme")?.valor).toBe(14_600_000);
    expect(t.segmentos.find((s) => s.chave === "comp26Risco")?.valor).toBe(37_100_000);
  });

  it("emRisco maior que comp26 é limitado a comp26", () => {
    const t = buildTorre2026({ ...real, comp26: 10_000_000, emRisco: 25_000_000 });
    expect(t.segmentos.find((s) => s.chave === "comp26Risco")?.valor).toBe(10_000_000);
    expect(t.segmentos.find((s) => s.chave === "comp26Firme")).toBeUndefined();
  });

  it("excesso material vira segmento 'excesso' e não há folga", () => {
    const t = buildTorre2026({ bg: 100_000_000, realizado: 90_000_000, emPagamento: 0, comp26: 20_000_000, emRisco: 0 });
    expect(t.excesso).toBe(10_000_000);
    expect(t.excessoMaterial).toBe(true);
    expect(t.folga).toBe(0);
    expect(t.segmentos.some((s) => s.chave === "folga")).toBe(false);
    expect(t.segmentos.at(-1)).toMatchObject({ chave: "excesso", valor: 10_000_000 });
    expect(somaSemFolga(t.segmentos)).toBe(t.ocupado);
  });

  it("excesso abaixo do limiar de materialidade não é material", () => {
    const excesso = LIMIAR_MATERIALIDADE - 1;
    const t = buildTorre2026({ bg: 100_000_000, realizado: 100_000_000 + excesso, emPagamento: 0, comp26: 0, emRisco: 0 });
    expect(t.excesso).toBe(excesso);
    expect(t.excessoMaterial).toBe(false);
  });

  it("base 0 → pct 0 e pctOcupado null", () => {
    const t = buildTorre2026({ bg: 0, realizado: 5_000_000, emPagamento: 0, comp26: 0, emRisco: 0 });
    expect(t.pctOcupado).toBeNull();
    expect(t.segmentos.every((s) => s.pctBase === 0)).toBe(true);
    expect(t.excesso).toBe(5_000_000);
  });

  it("nulos e negativos viram 0 e segmentos zerados são omitidos", () => {
    const t = buildTorre2026({ bg: 50, realizado: -10, emPagamento: NaN, comp26: 20, emRisco: 0 });
    expect(t.segmentos.map((s) => s.chave)).toEqual(["comp26Firme", "folga"]);
    expect(t.folga).toBe(30);
  });
});

describe("buildTorre2027", () => {
  it("compromisso 27 com 'a contratar' como folga", () => {
    const t = buildTorre2027({ bg: 200_000_000, comp27: 150_000_000 });
    expect(t.ano).toBe(2027);
    expect(t.pctOcupado).toBeCloseTo(0.75, 6);
    expect(t.folga).toBe(50_000_000);
    expect(t.segmentos).toEqual([
      { chave: "comp27", rotulo: "Compromisso 27", valor: 150_000_000, pctBase: 0.75 },
      { chave: "aContratar", rotulo: "A contratar", valor: 50_000_000, pctBase: 0.25 },
    ]);
  });

  it("comp27 acima do BG 27 gera excesso", () => {
    const t = buildTorre2027({ bg: 100_000_000, comp27: 110_000_000 });
    expect(t.excessoMaterial).toBe(true);
    expect(t.segmentos.map((s) => s.chave)).toEqual(["comp27", "excesso"]);
  });

  it("base 0 → pct null", () => {
    const t = buildTorre2027({ bg: 0, comp27: 0 });
    expect(t.pctOcupado).toBeNull();
    expect(t.segmentos).toEqual([]);
  });
});

describe("conciliacaoEmitido", () => {
  it("diferença material quando |valor| >= limiar", () => {
    const r = conciliacaoEmitido({ emitidoCarteira: 120_000_000, comp26: 51_700_000, comp27: 50_000_000 });
    expect(r.valor).toBe(18_300_000);
    expect(r.material).toBe(true);
  });

  it("diferença negativa material também conta", () => {
    const r = conciliacaoEmitido({ emitidoCarteira: 50_000_000, comp26: 60_000_000, comp27: 0 });
    expect(r.valor).toBe(-10_000_000);
    expect(r.material).toBe(true);
  });

  it("diferença abaixo do limiar não é material", () => {
    const r = conciliacaoEmitido({ emitidoCarteira: 1_000_000 + 50_000, comp26: 1_000_000, comp27: 0 });
    expect(r.valor).toBe(50_000);
    expect(r.material).toBe(false);
  });
});
