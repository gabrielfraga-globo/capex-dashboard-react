import { describe, expect, it } from "vitest";
import { buildAttentionList } from "./attention";
import type { AttentionSource } from "./types";

const src = (projectKey: string, value: number, extra: Partial<AttentionSource> = {}): AttentionSource => ({
  projectKey,
  projectName: `Projeto ${projectKey}`,
  owner: null,
  value,
  ...extra,
});

const parado = (projectKey: string, value: number, meses: number | null = 6) =>
  src(projectKey, value, { mesesSemCompromisso: meses });

const vazio = { acima: [], emRisco: [], parados: [], exerciseYear: 2026 };

describe("buildAttentionList", () => {
  it("deduplica projeto presente em ACIMA e PARADO, mantendo ACIMA", () => {
    const out = buildAttentionList({
      ...vazio,
      acima: [src("P1", 500_000)],
      parados: [parado("P1", 300_000)],
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("ACIMA_ORCAMENTO");
  });

  it("sinal desprezível não esconde outra fonte", () => {
    const out = buildAttentionList({
      ...vazio,
      acima: [src("P1", 300)],
      parados: [parado("P1", 2_000_000, 8)],
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("SALDO_PARADO");
    expect(out[0].value).toBe(2_000_000);
  });

  it("aplica cotas 2 + 2 + 1 na ordem de prioridade", () => {
    const out = buildAttentionList({
      ...vazio,
      acima: [src("A1", 500_000), src("A2", 400_000), src("A3", 300_000), src("A4", 200_000), src("A5", 100_000)],
      emRisco: [src("R1", 5_000), src("R2", 4_000), src("R3", 3_000), src("R4", 2_000), src("R5", 1_000)],
      parados: [parado("S1", 9_000), parado("S2", 8_000), parado("S3", 7_000), parado("S4", 6_000), parado("S5", 5_000)],
    });
    expect(out.map((i) => i.projectKey)).toEqual(["A1", "A2", "R1", "R2", "S1"]);
    expect(out.map((i) => i.kind)).toEqual([
      "ACIMA_ORCAMENTO",
      "ACIMA_ORCAMENTO",
      "RCS_EM_RISCO",
      "RCS_EM_RISCO",
      "SALDO_PARADO",
    ]);
  });

  it("faz backfill das vagas de EM_RISCO vazias com os maiores restantes", () => {
    const out = buildAttentionList({
      ...vazio,
      acima: [src("A1", 5_000), src("A2", 4_000), src("A3", 3_000), src("A4", 2_000), src("A5", 1_000)],
      parados: [parado("S1", 9_000), parado("S2", 8_000), parado("S3", 7_000), parado("S4", 6_000), parado("S5", 2_500)],
    });
    expect(out).toHaveLength(5);
    expect(out.filter((i) => i.kind === "RCS_EM_RISCO")).toHaveLength(0);
    expect(out.map((i) => i.projectKey)).toEqual(["A1", "A2", "S1", "S2", "S3"]);
  });

  it("ignora valores abaixo da tolerância de sinal", () => {
    const out = buildAttentionList({
      ...vazio,
      acima: [src("A1", 999)],
      emRisco: [src("R1", 1_000)],
    });
    expect(out.map((i) => i.projectKey)).toEqual(["R1"]);
  });

  it("formata o detalhe do SALDO_PARADO conforme os meses", () => {
    const detalheDe = (meses: number | null) =>
      buildAttentionList({ ...vazio, parados: [parado("S1", 50_000, meses)] })[0].detail;

    expect(detalheDe(1)).toBe("parado há 1 mês");
    expect(detalheDe(0)).toBe("parado neste mês");
    expect(detalheDe(null)).toBe("sem compromisso aprovado em 2026");
    expect(detalheDe(7)).toBe("parado há 7 meses");
  });

  it("define href por tipo", () => {
    const out = buildAttentionList({
      ...vazio,
      acima: [src("A1", 5_000)],
      emRisco: [src("R1", 4_000)],
      parados: [parado("S1", 3_000)],
    });
    const href = Object.fromEntries(out.map((i) => [i.kind, i.href]));
    expect(href).toEqual({
      ACIMA_ORCAMENTO: "/risco-caixa",
      RCS_EM_RISCO: "/radar",
      SALDO_PARADO: "/risco-caixa",
    });
  });
});
