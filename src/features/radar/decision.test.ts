import { describe, expect, it } from "vitest";
import { mergearRadar } from "./merge";
import { readDecision, suggestPaymentDate } from "./decision";
import type { CommitmentCuration, CommitmentSource, CommitmentSourceBundle, RcGroup } from "./types";

function makeCommitment(overrides: Partial<CommitmentSource> = {}): CommitmentSource {
  const rc = overrides.rc ?? "RC1";
  const oc = overrides.oc ?? "OC1";
  const projectId = overrides.projectId ?? "P1";
  return {
    commitmentKey: `RC:${rc}|OC:${oc}|PPM:${projectId}`,
    rc,
    oc,
    projectId,
    projectName: "Projeto Teste",
    rubrica: "MDO",
    supplier: "Fornecedor Teste",
    systemStatus: "OPEN",
    systemPromisedDate: null,
    systemNeedDate: null,
    sourceValue: 1000,
    lineCount: 1,
    details: [],
    ...overrides,
  };
}

function makeRcGroup(rc: string, commitmentKeys: string[], overrides: Partial<RcGroup> = {}): RcGroup {
  return {
    rc,
    commitmentKeys,
    totalValue: 0,
    projectIds: [],
    suppliers: [],
    ocs: [],
    isHeterogeneous: false,
    heterogeneityReasons: [],
    splitsExercise: false,
    ...overrides,
  };
}

function makeBundle(commitments: CommitmentSource[], rcGroups: RcGroup[], exercicio = 2026): CommitmentSourceBundle {
  return {
    generatedAt: new Date().toISOString(),
    exerciseYear: exercicio,
    commitments,
    rcGroups,
    discardedLines: 0,
    totals: { value: 0, lines: commitments.length, keys: commitments.length, rcs: rcGroups.length },
  };
}

function makeCuration(commitmentKey: string, overrides: Partial<CommitmentCuration> = {}): CommitmentCuration {
  return {
    commitmentKey,
    estimatedDeliveryDate: null,
    poStatus: "CONFIRMED",
    notes: null,
    sourceValueAtCuration: null,
    curationLevel: "RC",
    inheritedFromKey: null,
    updatedBy: "tester@g.globo",
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("suggestPaymentDate", () => {
  it("aplica a regra exata por etapa usando referenceDate obrigatório", () => {
    expect(suggestPaymentDate("E4", { dataPrometida: "2026-09-20", systemPromisedDate: "2026-09-20" }, "2026-09-25")).toBe("2026-11-13");
    expect(suggestPaymentDate("E4", { dataPrometida: "2026-10-10", systemPromisedDate: "2026-10-10" }, "2026-09-25")).toBe("2026-11-28");
    expect(suggestPaymentDate("E4", {}, "2026-09-25")).toBe("2026-11-13");
    expect(suggestPaymentDate("E5", {}, "2026-09-25")).toBe("2026-11-13");
    expect(suggestPaymentDate("E6", {}, "2026-09-25")).toBe("2026-11-03");
    expect(suggestPaymentDate("E1", {}, "2026-09-25")).toBeNull();
    expect(suggestPaymentDate("E2", {}, "2026-09-25")).toBeNull();
    expect(suggestPaymentDate("E3", {}, "2026-09-25")).toBeNull();
    expect(suggestPaymentDate("RESIDUAL", {}, "2026-09-25")).toBeNull();
  });
});

describe("readDecision", () => {
  it("mapeia legado de CONFIRMED + entrega 20/12 para PROXIMO", () => {
    const commitmentKey = "RC:RC1|OC:OC1|PPM:P1";
    const curation = makeCuration(commitmentKey, { poStatus: "CONFIRMED", estimatedDeliveryDate: "2026-12-20" });
    const decision = readDecision(curation, 2026, "2026-09-26");
    const bundle = makeBundle([makeCommitment({ rc: "RC1", oc: "OC1", projectId: "P1" })], [makeRcGroup("RC1", [commitmentKey])], 2026);
    const { views } = mergearRadar(bundle, { [curation.commitmentKey]: curation }, 2026);

    expect(decision.origin).toBe("LEGADO");
    expect(decision.cashForecast).toBe("CAIXA_PROXIMO_EXERCICIO");
    expect(decision.cashYear).toBe(2027);
    expect(decision.confidence).toBeNull();
    expect(views[0].bucket).toBe("CARRYOVER");
  });

  it("mapeia legado de CARRYOVER + entrega 10/10 para EXERCICIO", () => {
    const commitmentKey = "RC:RC2|OC:OC2|PPM:P2";
    const curation = makeCuration(commitmentKey, { poStatus: "CARRYOVER", estimatedDeliveryDate: "2026-10-10" });
    const decision = readDecision(curation, 2026, "2026-09-26");
    const bundle = makeBundle([makeCommitment({ rc: "RC2", oc: "OC2", projectId: "P2" })], [makeRcGroup("RC2", [commitmentKey])], 2026);
    const { views } = mergearRadar(bundle, { [curation.commitmentKey]: curation }, 2026);

    expect(decision.cashForecast).toBe("CAIXA_EXERCICIO");
    expect(decision.cashYear).toBe(2026);
    expect(decision.confidence).toBeNull();
    expect(views[0].bucket).toBe("CONFIRMED_IN_YEAR");
  });

  it("mapeia legado de AT_RISK + entrega 01/10 para EXERCICIO sem confiança", () => {
    const commitmentKey = "RC:RC3|OC:OC3|PPM:P3";
    const curation = makeCuration(commitmentKey, { poStatus: "AT_RISK", estimatedDeliveryDate: "2026-10-01" });
    const decision = readDecision(curation, 2026, "2026-09-26");
    const bundle = makeBundle([makeCommitment({ rc: "RC3", oc: "OC3", projectId: "P3" })], [makeRcGroup("RC3", [commitmentKey])], 2026);
    const { views } = mergearRadar(bundle, { [curation.commitmentKey]: curation }, 2026);

    expect(decision.cashForecast).toBe("CAIXA_EXERCICIO");
    expect(decision.cashYear).toBe(2026);
    expect(decision.confidence).toBeNull();
    expect(views[0].bucket).toBe("CONFIRMED_IN_YEAR");
  });

  it("mapeia legado de NO_VISIBILITY + entrega 20/11 para EXERCICIO com INCERTO", () => {
    const commitmentKey = "RC:RC4|OC:OC4|PPM:P4";
    const curation = makeCuration(commitmentKey, { poStatus: "NO_VISIBILITY", estimatedDeliveryDate: "2026-11-20" });
    const decision = readDecision(curation, 2026, "2026-09-26");
    const bundle = makeBundle([makeCommitment({ rc: "RC4", oc: "OC4", projectId: "P4" })], [makeRcGroup("RC4", [commitmentKey])], 2026);
    const { views } = mergearRadar(bundle, { [curation.commitmentKey]: curation }, 2026);

    expect(decision.cashForecast).toBe("CAIXA_EXERCICIO");
    expect(decision.cashYear).toBe(2026);
    expect(decision.confidence).toBe("INCERTO");
    expect(views[0].bucket).toBe("AT_RISK");
  });

  it("mapeia legado de CANCELLED com data para NAO_OCORRE / LEGADO", () => {
    const commitmentKey = "RC:RC5|OC:OC5|PPM:P5";
    const curation = makeCuration(commitmentKey, { poStatus: "CANCELLED", estimatedDeliveryDate: "2026-12-01" });
    const decision = readDecision(curation, 2026, "2026-09-26");
    const bundle = makeBundle([makeCommitment({ rc: "RC5", oc: "OC5", projectId: "P5" })], [makeRcGroup("RC5", [commitmentKey])], 2026);
    const { views } = mergearRadar(bundle, { [curation.commitmentKey]: curation }, 2026);

    expect(decision.cashForecast).toBe("NAO_OCORRE");
    expect(decision.cashYear).toBeNull();
    expect(decision.nonOccurrenceReason).toBe("LEGADO");
    expect(views[0].bucket).toBe("CANCELLED");
  });

  it("lê nextAction, blocker, priority, paymentMode e physicalArrival mesmo no legado", () => {
    const decision = readDecision({
      commitmentKey: "RC:RC6|OC:OC6|PPM:6",
      estimatedDeliveryDate: "2026-12-01",
      poStatus: "CONFIRMED",
      notes: null,
      sourceValueAtCuration: 1000,
      curationLevel: "RC",
      inheritedFromKey: null,
      updatedBy: "tester",
      updatedAt: "2026-09-25T00:00:00.000Z",
      nextAction: "Revisar contrato",
      blocker: "SEM_BLOQUEIO",
      priority: "ALTA",
      paymentMode: "ANTECIPADO",
      physicalArrival: true,
    }, 2026, "2026-09-26");

    expect(decision.nextAction).toBe("Revisar contrato");
    expect(decision.blocker).toBe("SEM_BLOQUEIO");
    expect(decision.priority).toBe("ALTA");
    expect(decision.paymentMode).toBe("ANTECIPADO");
    expect(decision.physicalArrival).toBe(true);
  });

  it("usa referenceDate para calcular decisionAgeDays e ignora curadoria nova quando tudo é null", () => {
    const legacyWithNullNewFields = {
      commitmentKey: "RC:RC7|OC:OC7|PPM:7",
      estimatedDeliveryDate: "2026-11-20",
      poStatus: "CONFIRMED",
      notes: null,
      sourceValueAtCuration: 1000,
      curationLevel: "RC",
      inheritedFromKey: null,
      updatedBy: "tester",
      updatedAt: "2026-09-25T00:00:00.000Z",
      cashForecast: null,
      forecastPaymentDate: null,
      suggestedPaymentDate: null,
      paymentDateAdjusted: null,
      paymentExceptionReason: null,
      confidence: null,
      nonOccurrenceReason: null,
      blocker: null,
      nextAction: null,
      nextActionUpdatedAt: null,
      physicalArrival: null,
      paymentMode: null,
      priority: null,
      decisionStage: null,
      decisionUpdatedAt: "2026-09-25T00:00:00.000Z",
    } as const;

    const decision = readDecision(legacyWithNullNewFields as any, 2026, "2026-09-26");

    expect(decision.origin).toBe("LEGADO");
    expect(decision.decisionAgeDays).toBe(1);
  });

  it("retorna NENHUMA quando não há curadoria", () => {
    expect(readDecision(null, 2026, "2026-09-26").origin).toBe("NENHUMA");
  });
});
