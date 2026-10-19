import { describe, expect, it } from "vitest";
import { buildKpisExecutivos, type KpiLinhaExecutiva } from "./kpis";

const linha = (over: Partial<KpiLinhaExecutiva> = {}): KpiLinhaExecutiva => ({
  orcamento2026: 0,
  realizado2026: 0,
  emPagamento2026: 0,
  compromisso: 0,
  ...over,
});

const REAL = {
  lista: [
    linha({
      orcamento2026: 145_150_601,
      realizado2026: 80_000_000,
      emPagamento2026: 8_997_307,
      compromisso: 62_630_086,
    }),
  ],
  planejadoAcumulado: null,
  saldo: { saldoDisponivel: -4_461_848, saldoPotencial: 3_114_976, projetosComSaldo: 7 },
};

describe("buildKpisExecutivos", () => {
  it("reproduz o caso real: excesso e excesso sem legado", () => {
    const k = buildKpisExecutivos(REAL);
    expect(k.orcamento).toBe(145_150_601);
    expect(k.caixa).toBe(88_997_307);
    expect(k.emPagamento).toBe(8_997_307);
    expect(k.compromissoTotal).toBe(62_630_086);
    expect(k.comprometido).toBe(151_627_393);
    expect(k.excesso).toBe(6_476_792);
    expect(k.excessoSemLegado).toBe(4_461_848);
    expect(k.folgaParada).toBe(3_114_976);
    expect(k.projetosParados).toBe(7);
    expect(k.pctCaixa).toBeCloseTo(0.6131, 4);
    expect(k.pctComprometido).toBeCloseTo(1.0446, 4);
  });

  it("soma todas as linhas e trata nulos como 0", () => {
    const k = buildKpisExecutivos({
      lista: [
        linha({ orcamento2026: 100, realizado2026: 10, emPagamento2026: null, compromisso: 5 }),
        linha({ orcamento2026: null, realizado2026: null, emPagamento2026: 20, compromisso: null }),
        linha({ orcamento2026: 50, realizado2026: 30, emPagamento2026: 5, compromisso: 15 }),
      ],
      planejadoAcumulado: null,
    });
    expect(k.orcamento).toBe(150);
    expect(k.caixa).toBe(65);
    expect(k.emPagamento).toBe(25);
    expect(k.compromissoTotal).toBe(20);
    expect(k.comprometido).toBe(85);
    expect(k.excesso).toBe(0);
  });

  it("pctCaixa e pctComprometido são null quando o orçamento é 0", () => {
    const k = buildKpisExecutivos({
      lista: [linha({ realizado2026: 100, compromisso: 50 })],
      planejadoAcumulado: null,
    });
    expect(k.pctCaixa).toBeNull();
    expect(k.pctComprometido).toBeNull();
    expect(k.excesso).toBe(150);
  });

  it("desvioPlano é caixa − planejado quando há planejado; null caso contrário", () => {
    expect(buildKpisExecutivos({ ...REAL, planejadoAcumulado: 90_000_000 }).desvioPlano).toBe(-1_002_693);
    expect(buildKpisExecutivos({ ...REAL, planejadoAcumulado: null }).desvioPlano).toBeNull();
  });

  it("sem saldo, os campos de saldo são null e excesso não é ajustado", () => {
    const k = buildKpisExecutivos({ ...REAL, saldo: null });
    expect(k.excessoSemLegado).toBeNull();
    expect(k.folgaParada).toBeNull();
    expect(k.projetosParados).toBeNull();
  });

  it("excessoSemLegado é 0 quando o saldo disponível é positivo", () => {
    const k = buildKpisExecutivos({
      ...REAL,
      saldo: { saldoDisponivel: 1_000, saldoPotencial: 0, projetosComSaldo: 0 },
    });
    expect(k.excessoSemLegado).toBe(0);
  });

  it("excesso é 0 quando o comprometido não passa o orçamento", () => {
    const k = buildKpisExecutivos({
      lista: [linha({ orcamento2026: 100, realizado2026: 40, compromisso: 30 })],
      planejadoAcumulado: null,
    });
    expect(k.excesso).toBe(0);
    expect(k.pctComprometido).toBeCloseTo(0.7, 10);
  });
});
