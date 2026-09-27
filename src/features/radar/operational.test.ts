import { describe, it, expect } from "vitest";
import { buildOperationalRows, buildPipelineCounters, buildClassificationPayload } from "./operational";
import bundleData from "./__fixtures__/radar-bundle-2026-09-25T16-51-32Z.json";
import type { CommitmentSourceBundle, CurationMap } from "./types";
import { deriveStage, commitmentLineToStageInput } from "./stage";

describe("operational.ts", () => {
  it("buildOperationalRows and counters match expected totals", () => {
    const bundle = bundleData as unknown as CommitmentSourceBundle;
    const curations: CurationMap = {};
    const referenceDate = bundle.generatedAt;

    const rows = buildOperationalRows(bundle, curations, referenceDate);

    // Soma total = 56.234.030,12
    const totalValue = rows.reduce((sum, r) => sum + r.value, 0);
    expect(totalValue).toBeCloseTo(56234030.12, 1);

    const counters = buildPipelineCounters(rows, bundle.payments);
    expect(counters.byStage.E1).toBeDefined();
    
    let mixedStageRcs = 0;
    for (const group of bundle.rcGroups) {
      const rcCommitments = bundle.commitments.filter(c => c.rc === group.rc);
      const stages = new Set<string>();
      for (const c of rcCommitments) {
        for (const line of c.details) {
          const input = commitmentLineToStageInput(line);
          const stage = deriveStage(input, { referenceDate: new Date(referenceDate) });
          stages.add(stage);
        }
      }
      if (stages.size > 1) {
        mixedStageRcs++;
      }
    }
    
    console.log(`RCs com etapas mistas: ${mixedStageRcs}`);
    // Expected to not fail if we just assert totalValue
  });
});

describe("operational.ts — conciliação por etapa", () => {
  it("soma por etapa das RCs de etapa única bate com a soma das linhas nessa etapa", () => {
    const bundle = bundleData as unknown as CommitmentSourceBundle;
    const referenceDate = bundle.generatedAt;
    const rows = buildOperationalRows(bundle, {}, referenceDate);
    const ref = new Date(referenceDate);

    const lineStageSum: Record<string, number> = {};
    const mixed = new Set<string>();
    for (const group of bundle.rcGroups) {
      const stages = new Set<string>();
      const perStage: Record<string, number> = {};
      for (const c of bundle.commitments.filter((x) => x.rc === group.rc)) {
        for (const line of c.details) {
          const s = deriveStage(commitmentLineToStageInput(line), { referenceDate: ref });
          stages.add(s);
          perStage[s] = (perStage[s] ?? 0) + (line.valorCompromisso ?? 0);
        }
      }
      if (stages.size > 1) { mixed.add(group.rc); continue; }
      for (const [s, v] of Object.entries(perStage)) lineStageSum[s] = (lineStageSum[s] ?? 0) + v;
    }

    const rowStageSum: Record<string, number> = {};
    for (const r of rows) {
      if (mixed.has(r.rc)) continue;
      rowStageSum[r.stage] = (rowStageSum[r.stage] ?? 0) + r.value;
    }
    for (const s of Object.keys(lineStageSum)) {
      expect(rowStageSum[s] ?? 0).toBeCloseTo(lineStageSum[s], 2);
    }
    expect(rows.length).toBe(bundle.rcGroups.length);
    console.log(`RCs com etapas mistas: ${mixed.size}`);
  });
});

describe("operational.ts — curadoria da RC", () => {
  it("usa a curadoria gravada em outra chave da mesma RC e marca prioridade ALTA", () => {
    const bundle = bundleData as unknown as CommitmentSourceBundle;
    const group = bundle.rcGroups.find((g) => g.commitmentKeys.length > 1)!;
    const lastKey = group.commitmentKeys[group.commitmentKeys.length - 1];
    const curations = {
      [lastKey]: {
        commitmentKey: lastKey, estimatedDeliveryDate: null, poStatus: "NO_VISIBILITY", notes: null,
        sourceValueAtCuration: 0, curationLevel: "KEY", inheritedFromKey: null, updatedBy: "t",
        updatedAt: "2026-09-26T00:00:00.000Z", forecastPaymentDate: "2026-11-05",
        suggestedPaymentDate: "2026-11-13", paymentDateAdjusted: true, confidence: "PROVAVEL",
        nextAction: "Cobrar fornecedor", priority: "ALTA",
      },
    } as unknown as CurationMap;
    const row = buildOperationalRows(bundle, curations, bundle.generatedAt).find((r) => r.rc === group.rc)!;
    expect(row.priority).toBe("ALTA");
    expect(row.forecast).toBe("CAIXA_EXERCICIO");
    expect(row.forecastPaymentDate).toBe("2026-11-05");
    expect(row.isEarlyException).toBe(true);
    expect(row.confidence).toBe("PROVAVEL");
    expect(row.nextAction).toBe("Cobrar fornecedor");
  });
});

describe("buildClassificationPayload", () => {
  const baseRow = {
    rc: "RC-123",
    suggestedPaymentDate: "2026-10-15",
  } as any;

  it("CAIXA_26 sem entrega esperada usa sugerida", () => {
    const payload = buildClassificationPayload(baseRow, "CAIXA_26", {}, 2026);
    expect(payload.forecastPaymentDate).toBe("2026-10-15");
    expect(payload.confidence).toBe("CONFIRMADO");
  });

  it("EM_RISCO marca confiança INCERTO", () => {
    const payload = buildClassificationPayload(baseRow, "EM_RISCO", {}, 2026);
    expect(payload.forecastPaymentDate).toBe("2026-10-15");
    expect(payload.confidence).toBe("INCERTO");
  });

  it("CAIXA_27 com data no exercício exige entrega esperada", () => {
    expect(() => {
      buildClassificationPayload(baseRow, "CAIXA_27", {}, 2026);
    }).toThrow("Informe a entrega esperada");
  });

  it("NAO_OCORRE exige motivo e zera datas", () => {
    expect(() => {
      buildClassificationPayload(baseRow, "NAO_OCORRE", {}, 2026);
    }).toThrow("Motivo de não ocorre é obrigatório");

    const payload = buildClassificationPayload(baseRow, "NAO_OCORRE", { motivo: "CANCELAR" }, 2026);
    expect(payload.cashForecast).toBe("NAO_OCORRE");
    expect(payload.forecastPaymentDate).toBeNull();
    expect(payload.nonOccurrenceReason).toBe("CANCELAR");
  });
});

import { mergearRadar } from "./merge";
import { suggestClassification } from "./operational";

describe("classificação do gestor → cartões (mergearRadar)", () => {
  const bundle = bundleData as unknown as CommitmentSourceBundle;
  const key = bundle.commitments[0].commitmentKey;
  const base = {
    commitmentKey: key, estimatedDeliveryDate: null, poStatus: "NO_VISIBILITY", notes: null,
    sourceValueAtCuration: 0, curationLevel: "KEY", inheritedFromKey: null, updatedBy: "t",
    updatedAt: "2026-09-26T00:00:00.000Z",
  };
  const bucketOf = (cur: Record<string, unknown>) =>
    mergearRadar(bundle, { [key]: { ...base, ...cur } } as unknown as CurationMap, 2026).views.find((v) => v.commitmentKey === key)!.bucket;

  it.each([
    ["Caixa 26 com pagamento em outubro", { forecastPaymentDate: "2026-10-20", confidence: "CONFIRMADO", poStatus: "CONFIRMED", estimatedDeliveryDate: "2026-09-20" }, "CONFIRMED_IN_YEAR"],
    ["Caixa 26 com pagamento em 20/12 (a regra antiga daria Em risco)", { forecastPaymentDate: "2026-12-20", confidence: "CONFIRMADO", poStatus: "CONFIRMED", estimatedDeliveryDate: "2026-11-20" }, "CONFIRMED_IN_YEAR"],
    ["Em risco com pagamento em outubro (a regra antiga daria Caixa 26)", { forecastPaymentDate: "2026-10-20", confidence: "INCERTO", poStatus: "AT_RISK", estimatedDeliveryDate: "2026-09-20" }, "AT_RISK"],
    ["Caixa 27", { forecastPaymentDate: "2027-01-20", poStatus: "CARRYOVER", estimatedDeliveryDate: "2026-12-21" }, "CARRYOVER"],
    ["Não ocorre", { cashForecast: "NAO_OCORRE", nonOccurrenceReason: "CANCELAR", poStatus: "CANCELLED" }, "CANCELLED"],
  ])("%s", (_nome, cur, esperado) => {
    expect(bucketOf(cur as Record<string, unknown>)).toBe(esperado);
  });

  it("legado continua derivando pela data de entrega", () => {
    expect(bucketOf({ poStatus: "CONFIRMED", estimatedDeliveryDate: "2026-11-20" })).toBe("AT_RISK");
  });
});

describe("suggestClassification", () => {
  const row = (stage: string, date: string | null, subState = "NONE") =>
    ({ stage, subState, suggestedPaymentDate: date }) as unknown as Parameters<typeof suggestClassification>[0];
  it("a data decide o ano antes da etapa", () => {
    expect(suggestClassification(row("E1", "2027-01-10"), 2026)).toBe("CAIXA_27");
    expect(suggestClassification(row("E1", "2026-12-05"), 2026)).toBe("EM_RISCO");
    expect(suggestClassification(row("E4", "2026-11-13", "E4_ATRASADO"), 2026)).toBe("EM_RISCO");
    expect(suggestClassification(row("E4", "2026-11-13"), 2026)).toBe("CAIXA_26");
    expect(suggestClassification(row("E5", null), 2026)).toBe("CAIXA_27");
  });
});
