import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergearRadar } from "./merge";
import { buildStageReport, deriveDaysInStage, deriveStage, deriveSubState, stageReportFromBundle } from "./stage";

const fixture = JSON.parse(
  readFileSync(new URL("./__fixtures__/radar-bundle-2026-09-25T16-51-32Z.json", import.meta.url), "utf8")
) as {
  generatedAt: string;
  commitments: Array<{ systemStatus: string; sourceValue: number; oc: string | null; projectId: string; rc: string }>;
  totals: { value: number; lines: number; keys: number; rcs: number };
};

describe("deriveStage — regras operacionais reais do BI", () => {
  it("E1 exige RC pendente e OC vazia", () => {
    expect(
      deriveStage({
        statusCompromisso: "PENDING APPROVAL",
        statusRc: "PENDING APPROVAL",
        ordemCompra: "",
        valorCompromisso: 2500,
      }, { referenceDate: "2026-09-25" })
    ).toBe("E1");
  });

  it("E2 exige RC aprovada e OC vazia", () => {
    expect(
      deriveStage({
        statusCompromisso: "APPROVED",
        statusRc: "APPROVED",
        ordemCompra: "",
        comprador: "Ana",
        valorCompromisso: 5000,
      }, { referenceDate: "2026-09-25" })
    ).toBe("E2");
  });

  it("E3 prevalece quando a OC já existe e a RC está aprovada", () => {
    expect(
      deriveStage({
        statusCompromisso: "PENDING APPROVAL",
        statusRc: "APPROVED",
        ordemCompra: "OC-1",
        valorCompromisso: 3200,
      }, { referenceDate: "2026-09-25" })
    ).toBe("E3");
  });

  it("E4 mantém precedência quando o status é OPEN e a OC existe", () => {
    expect(
      deriveStage({
        statusCompromisso: "OPEN",
        statusRc: "APPROVED",
        ordemCompra: "OC-123",
        comprador: "Ana",
        dataPrometida: "2026-12-20",
        valorCompromisso: 7500,
      }, { referenceDate: "2026-09-25" })
    ).toBe("E4");
  });

  it("E5 é derivado de CLOSED FOR RECEIVING com OC", () => {
    expect(
      deriveStage({
        statusCompromisso: "CLOSED FOR RECEIVING",
        statusRc: "APPROVED",
        ordemCompra: "OC-1",
        dataPrometida: "2026-09-15",
        dtCriacaoComp: "2026-02-01",
        valorCompromisso: 1200,
      }, { referenceDate: "2026-09-25" })
    ).toBe("E5");
  });

  it("E6 usa Recebido | Sem Contabilização com OC", () => {
    expect(
      deriveStage({
        statusCompromisso: "RECEBIDO | SEM CONTABILIZAÇÃO",
        statusRc: "APPROVED",
        ordemCompra: "OC-1",
        valorCompromisso: 1500,
      }, { referenceDate: "2026-09-25" })
    ).toBe("E6");
  });

  it("RESIDUAL cobre status fechado com OC e qualquer saldo pequeno", () => {
    expect(
      deriveStage({
        statusCompromisso: "CLOSED",
        statusRc: "APPROVED",
        ordemCompra: "OC-1",
        valorCompromisso: 500,
      }, { referenceDate: "2026-09-25" })
    ).toBe("RESIDUAL");

    expect(
      deriveStage({
        statusCompromisso: "APPROVED",
        statusRc: "APPROVED",
        ordemCompra: "OC-1",
        valorCompromisso: 500,
      }, { referenceDate: "2026-09-25" })
    ).toBe("RESIDUAL");
  });

  it("DESCONHECIDA abre para OPEN sem OC e status fora da lista com OC", () => {
    expect(
      deriveStage({
        statusCompromisso: "OPEN",
        statusRc: "APPROVED",
        ordemCompra: "",
        valorCompromisso: 1500,
      }, { referenceDate: "2026-09-25" })
    ).toBe("DESCONHECIDA");

    expect(
      deriveStage({
        statusCompromisso: "STATUS_X",
        statusRc: "APPROVED",
        ordemCompra: "OC-1",
        valorCompromisso: 1500,
      }, { referenceDate: "2026-09-25" })
    ).toBe("DESCONHECIDA");
  });
});

describe("deriveSubState", () => {
  it("E2 sem comprador vira sub-estado E2_SEM_COMPRADOR", () => {
    expect(
      deriveSubState(
        { statusRc: "APPROVED", statusCompromisso: "APPROVED", ordemCompra: "", valorCompromisso: 1500 },
        "E2"
      )
    ).toBe("E2_SEM_COMPRADOR");
  });

  it("E4 parcial mantém sub-estado E4_PARCIAL", () => {
    expect(
      deriveSubState(
        { statusRc: "APPROVED", statusCompromisso: "OPEN", ordemCompra: "OC-1", entregaParcial: true, valorCompromisso: 1500 },
        "E4"
      )
    ).toBe("E4_PARCIAL");
  });

  it("E4 com chegada manual vira E4_CHEGOU", () => {
    expect(
      deriveSubState(
        { statusRc: "APPROVED", statusCompromisso: "OPEN", ordemCompra: "OC-1", chegouFisicamente: true, valorCompromisso: 1500 },
        "E4"
      )
    ).toBe("E4_CHEGOU");
  });

  it("E4 com data prometida vencida vira E4_ATRASADO", () => {
    expect(
      deriveSubState(
        {
          statusRc: "APPROVED",
          statusCompromisso: "OPEN",
          ordemCompra: "OC-1",
          dataPrometida: "2026-06-01",
          valorCompromisso: 1500,
        },
        "E4",
        { referenceDate: "2026-06-10" }
      )
    ).toBe("E4_ATRASADO");
  });
});

describe("deriveDaysInStage", () => {
  it("usa a data de entrada e remove o fallback para necessidade", () => {
    expect(
      deriveDaysInStage(
        { dtCriacaoComp: "2026-09-20", valorCompromisso: 1500 },
        "E1",
        { referenceDate: "2026-09-25" }
      )
    ).toBe(5);

    expect(
      deriveDaysInStage(
        { dtReqAprov: "2026-09-20", valorCompromisso: 1500 },
        "E2",
        { referenceDate: "2026-09-25" }
      )
    ).toBe(5);

    expect(
      deriveDaysInStage(
        { valorCompromisso: 1500 },
        "E4",
        { referenceDate: "2026-09-25" }
      )
    ).toBeNull();
  });
});

describe("buildStageReport", () => {
  it("conta RESIDUAL e DESCONHECIDA em combinações reais e agrega valor total", () => {
    const report = buildStageReport([
      { statusCompromisso: "PENDING APPROVAL", statusRc: "PENDING APPROVAL", ordemCompra: "", valorCompromisso: 1200 },
      { statusCompromisso: "OPEN", statusRc: "APPROVED", ordemCompra: "OC-1", comprador: "Ana", valorCompromisso: 1500 },
      { statusCompromisso: "CLOSED FOR RECEIVING", statusRc: "APPROVED", ordemCompra: "OC-1", dataPrometida: "2026-09-15", valorCompromisso: 1500 },
      { statusCompromisso: "RECEBIDO | SEM CONTABILIZAÇÃO", statusRc: "APPROVED", ordemCompra: "OC-1", valorCompromisso: 1500 },
      { statusCompromisso: "CLOSED", statusRc: "APPROVED", ordemCompra: "OC-1", valorCompromisso: 500 },
      { statusCompromisso: "STATUS_X", statusRc: "APPROVED", ordemCompra: "OC-1", valorCompromisso: 1500 },
    ]);

    expect(report.totalLines).toBe(6);
    expect(report.totalValue).toBe(7700);
    expect(report.byStage.E1.lines).toBe(1);
    expect(report.byStage.E4.lines).toBe(1);
    expect(report.byStage.E5.lines).toBe(1);
    expect(report.byStage.E6.lines).toBe(1);
    expect(report.byStage.RESIDUAL.lines).toBe(1);
    expect(report.byStage.DESCONHECIDA.lines).toBe(1);
  });
});

describe("fixture do commit", () => {
  it("oráculo por linha do bundle bate com a fixture do HEAD", () => {
    const report = stageReportFromBundle(fixture as any, { referenceDate: "2026-09-25" });
    const expected: Record<string, { lines: number; value: number }> = {
      E1: { lines: 38, value: 6_990_000 },
      E2: { lines: 61, value: 8_730_000 },
      E3: { lines: 20, value: 5_160_000 },
      E4: { lines: 195, value: 19_800_000 },
      E5: { lines: 139, value: 12_710_000 },
      RESIDUAL: { lines: 437, value: 2_840_000 },
      DESCONHECIDA: { lines: 1, value: 0 },
    };

    const diffs: string[] = [];
    for (const [stage, target] of Object.entries(expected)) {
      const entry = report.byStage[stage as keyof typeof report.byStage];
      const valueDelta = Math.abs((entry?.value ?? 0) - target.value);
      if (entry == null || entry.lines !== target.lines || valueDelta > 10_000) {
        diffs.push(`${stage}: lines=${entry?.lines ?? "missing"}/${target.lines}; value=${entry?.value ?? 0}/${target.value}; delta=${valueDelta}`);
      }
    }

    if (diffs.length) {
      throw new Error(`Diversão na fixture: ${diffs.join(" | ")}`);
    }

    expect(report.totalLines).toBe(891);
    expect(Math.abs(report.totalValue - 56_234_030.12)).toBeLessThanOrEqual(10_000);
  });

  it("mergearRadar continua estável para buckets, coverage e reconciles", () => {
    const { resumo } = mergearRadar(fixture as any, {}, 2026);

    expect(resumo.reconciles).toBe(true);
    expect(resumo.totalCommitment).toBeCloseTo(fixture.totals.value, 2);
    expect(Object.keys(resumo.buckets)).toEqual([
      "CONFIRMED_IN_YEAR",
      "CARRYOVER",
      "CONFIRMED_NO_DATE",
      "AT_RISK",
      "NO_VISIBILITY",
      "CANCELLED",
      "NOT_CURATED",
    ]);
    expect(resumo.buckets.NOT_CURATED).toBe(fixture.totals.value);
    expect(resumo.buckets.CONFIRMED_IN_YEAR).toBe(0);
    expect(resumo.buckets.CARRYOVER).toBe(0);
    expect(resumo.buckets.CONFIRMED_NO_DATE).toBe(0);
    expect(resumo.buckets.AT_RISK).toBe(0);
    expect(resumo.buckets.NO_VISIBILITY).toBe(0);
    expect(resumo.buckets.CANCELLED).toBe(0);
    expect(resumo.coverage.curatedKeys).toBe(0);
    expect(resumo.coverage.totalKeys).toBe(831);
    expect(resumo.coverage.ratio).toBe(0);
  });
});
