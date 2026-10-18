import { describe, expect, it } from "vitest";
import type { SaldoProjetoLinha } from "../radar/types";
import { SALDO_SIGNAL_TOLERANCE } from "./saldoConfig";
import {
  aggregateSaldoBy,
  buildSaldoBridge,
  classifySaldo,
  mesesDesde,
  summarizeSaldo,
} from "./saldo";

function mkLinha(parcial: Partial<SaldoProjetoLinha> = {}): SaldoProjetoLinha {
  return {
    projectKey: "projeto-a|lb a",
    n4: "Projeto A",
    aprovador: "Aprovador 1",
    nomeLB: "LB A",
    rubrica: "Rubrica 1",
    ano: 2026,
    orcamento: 100_000,
    caixa: 0,
    deltaCaixa: 100_000,
    compromissoTotal: 0,
    compromissoValido: 0,
    saldoDisponivel: 100_000,
    ultimaDataCompromisso: null,
    flagSaldo: false,
    saldoPotencial: 0,
    ...parcial,
  };
}

const TOTALS_BASE = {
  orcamento: 100_000,
  caixa: 0,
  deltaCaixa: 0,
  compromissoTotal: 0,
  compromissoValido: 0,
  compromissoLegado: 0,
  saldoDisponivel: 0,
  saldoPotencial: 0,
  projetos: 1,
  projetosComSaldo: 0,
  linhasComFlag: 0,
};

describe("saldo.ts", () => {
  it("classifySaldo cobre cada sinal e as bordas de ±SALDO_SIGNAL_TOLERANCE", () => {
    const tol = SALDO_SIGNAL_TOLERANCE;

    expect(classifySaldo({ ...TOTALS_BASE, deltaCaixa: -tol - 0.01 })).toBe("ESTOURO_CAIXA");
    expect(classifySaldo({ ...TOTALS_BASE, deltaCaixa: -tol })).not.toBe("ESTOURO_CAIXA");

    expect(classifySaldo({ ...TOTALS_BASE, orcamento: 0 })).toBe("SEM_ORCAMENTO");

    expect(classifySaldo({ ...TOTALS_BASE, saldoDisponivel: -tol - 0.01 })).toBe("COMPROMETIDO_ACIMA");
    expect(classifySaldo({ ...TOTALS_BASE, saldoDisponivel: -tol })).toBe("EM_EXECUCAO");

    expect(classifySaldo({ ...TOTALS_BASE, saldoPotencial: 120_000 })).toBe("SALDO_PARADO");
    expect(classifySaldo({ ...TOTALS_BASE, linhasComFlag: 2 })).toBe("SALDO_RESIDUAL");
    expect(classifySaldo(TOTALS_BASE)).toBe("EM_EXECUCAO");
  });

  it("Σ de aggregateSaldoBy é igual a summarizeSaldo, por projeto e por rubrica", () => {
    const linhas = [
      mkLinha({ projectKey: "p1|a", rubrica: "R1", orcamento: 200_000, caixa: 50_000, deltaCaixa: 150_000, compromissoTotal: 30_000, compromissoValido: 20_000, saldoDisponivel: 130_000, saldoPotencial: 80_000, flagSaldo: true }),
      mkLinha({ projectKey: "p1|a", rubrica: "R2", orcamento: 100_000, caixa: 10_000, deltaCaixa: 90_000, compromissoTotal: 5_000, compromissoValido: 5_000, saldoDisponivel: 85_000 }),
      mkLinha({ projectKey: "p2|b", nomeLB: "LB B", rubrica: "R1", orcamento: 300_000, caixa: 320_000, deltaCaixa: -20_000, compromissoTotal: 10_000, compromissoValido: 10_000, saldoDisponivel: -30_000 }),
    ];
    const total = summarizeSaldo(linhas);
    const campos = ["orcamento", "caixa", "deltaCaixa", "compromissoTotal", "compromissoValido", "compromissoLegado", "saldoDisponivel", "saldoPotencial"] as const;

    for (const dim of ["projeto", "rubrica"] as const) {
      const views = aggregateSaldoBy(linhas, dim);
      for (const campo of campos) {
        const soma = views.reduce((acc, v) => acc + v[campo], 0);
        expect(soma).toBeCloseTo(total[campo], 2);
      }
      expect(views.reduce((acc, v) => acc + v.linhasComFlag, 0)).toBe(linhas.filter((l) => l.flagSaldo).length);
    }
  });

  it("agregado com flag e saldoPotencial 0 mantém saldoPotencial 0 e sinal SALDO_RESIDUAL", () => {
    const linhas = [
      mkLinha({ rubrica: "R1", saldoDisponivel: 30_000, deltaCaixa: 30_000, flagSaldo: true, saldoPotencial: 0 }),
      mkLinha({ rubrica: "R1", saldoDisponivel: 30_000, deltaCaixa: 30_000, flagSaldo: true, saldoPotencial: 0 }),
    ];
    const [view] = aggregateSaldoBy(linhas, "rubrica");

    expect(view.saldoPotencial).toBe(0);
    expect(view.linhasComFlag).toBe(2);
    expect(view.signal).toBe("SALDO_RESIDUAL");
  });

  it("compromissoLegado = compromissoTotal − compromissoValido", () => {
    const t = summarizeSaldo([
      mkLinha({ compromissoTotal: 70_000, compromissoValido: 25_000 }),
      mkLinha({ compromissoTotal: 10_000, compromissoValido: 5_000 }),
    ]);

    expect(t.compromissoLegado).toBe(t.compromissoTotal - t.compromissoValido);
    expect(t.compromissoLegado).toBe(50_000);
  });

  it("o último result da ponte é igual a saldoDisponivel", () => {
    const t = summarizeSaldo([
      mkLinha({ orcamento: 500_000, caixa: 120_000, deltaCaixa: 380_000, compromissoValido: 90_000, saldoDisponivel: 290_000, saldoPotencial: 60_000 }),
    ]);
    const results = buildSaldoBridge(t).filter((s) => s.kind === "result");

    expect(results.at(-1)?.value).toBe(t.saldoDisponivel);
  });

  it("mesesDesde trata null e meses completos de calendário", () => {
    expect(mesesDesde(null, "2026-10-17")).toBeNull();
    expect(mesesDesde("2026-01-17", "2026-10-17")).toBe(9);
    expect(mesesDesde("2026-01-18", "2026-10-17")).toBe(8);
  });
});
