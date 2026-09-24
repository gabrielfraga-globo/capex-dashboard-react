import { describe, expect, it } from "vitest";
import { mergearRadar } from "./merge";
import { mascaraParaIso } from "./dateMask";
import type { CommitmentCuration, CommitmentSource, CommitmentSourceBundle, CurationMap, RcGroup } from "./types";

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

describe("mascaraParaIso — validação de datas", () => {
  it("permite datas retroativas válidas e bloqueia intervalos absurdos", () => {
    expect(mascaraParaIso("15/01/20")).toBe("2020-01-15");
    expect(mascaraParaIso("10/06/25")).toBe("2025-06-10");
    expect(mascaraParaIso("31/12/19")).toBeNull();
    expect(mascaraParaIso("01/01/30")).toBe("2030-01-01");
    expect(mascaraParaIso("01/01/31")).toBeNull();
    expect(mascaraParaIso("15/01/32")).toBeNull();
  });
});

describe("mergearRadar — classificação nos 7 baldes", () => {
  it("CONFIRMED + pagamento <= 31/12 -> CONFIRMED_IN_YEAR", () => {
    const c = makeCommitment({ rc: "RC1", oc: "OC1", projectId: "P1" });
    const curationMap: CurationMap = {
      [c.commitmentKey]: makeCuration(c.commitmentKey, { poStatus: "CONFIRMED", estimatedDeliveryDate: "2026-11-01" }),
    };
    const bundle = makeBundle([c], [makeRcGroup("RC1", [c.commitmentKey])]);

    const { views } = mergearRadar(bundle, curationMap, 2026);

    expect(views[0].bucket).toBe("CONFIRMED_IN_YEAR");
    expect(views[0].isCurated).toBe(true);
  });

  it("CONFIRMED + pagamento > 31/12 -> CARRYOVER", () => {
    const c = makeCommitment({ rc: "RC1", oc: "OC1", projectId: "P1" });
    const curationMap: CurationMap = {
      [c.commitmentKey]: makeCuration(c.commitmentKey, { poStatus: "CONFIRMED", estimatedDeliveryDate: "2026-12-15" }),
    };
    const bundle = makeBundle([c], [makeRcGroup("RC1", [c.commitmentKey])]);

    const { views } = mergearRadar(bundle, curationMap, 2026);

    expect(views[0].bucket).toBe("CARRYOVER");
  });

  it("CONFIRMED sem data -> CONFIRMED_NO_DATE", () => {
    const c = makeCommitment({ rc: "RC1", oc: "OC1", projectId: "P1" });
    const curationMap: CurationMap = {
      [c.commitmentKey]: makeCuration(c.commitmentKey, { poStatus: "CONFIRMED", estimatedDeliveryDate: null }),
    };
    const bundle = makeBundle([c], [makeRcGroup("RC1", [c.commitmentKey])]);

    const { views } = mergearRadar(bundle, curationMap, 2026);

    expect(views[0].bucket).toBe("CONFIRMED_NO_DATE");
  });

  it("AT_RISK -> AT_RISK", () => {
    const c = makeCommitment({ rc: "RC1", oc: "OC1", projectId: "P1" });
    const curationMap: CurationMap = {
      [c.commitmentKey]: makeCuration(c.commitmentKey, { poStatus: "AT_RISK", estimatedDeliveryDate: "2026-11-01" }),
    };
    const bundle = makeBundle([c], [makeRcGroup("RC1", [c.commitmentKey])]);

    const { views } = mergearRadar(bundle, curationMap, 2026);

    expect(views[0].bucket).toBe("AT_RISK");
  });

  it("NO_VISIBILITY -> NO_VISIBILITY", () => {
    const c = makeCommitment({ rc: "RC1", oc: "OC1", projectId: "P1" });
    const curationMap: CurationMap = {
      [c.commitmentKey]: makeCuration(c.commitmentKey, { poStatus: "NO_VISIBILITY" }),
    };
    const bundle = makeBundle([c], [makeRcGroup("RC1", [c.commitmentKey])]);

    const { views } = mergearRadar(bundle, curationMap, 2026);

    expect(views[0].bucket).toBe("NO_VISIBILITY");
  });

  it("CANCELLED -> CANCELLED", () => {
    const c = makeCommitment({ rc: "RC1", oc: "OC1", projectId: "P1" });
    const curationMap: CurationMap = {
      [c.commitmentKey]: makeCuration(c.commitmentKey, { poStatus: "CANCELLED" }),
    };
    const bundle = makeBundle([c], [makeRcGroup("RC1", [c.commitmentKey])]);

    const { views } = mergearRadar(bundle, curationMap, 2026);

    expect(views[0].bucket).toBe("CANCELLED");
  });

  it("sem curadoria -> NOT_CURATED", () => {
    const c = makeCommitment({ rc: "RC1", oc: "OC1", projectId: "P1" });
    const bundle = makeBundle([c], [makeRcGroup("RC1", [c.commitmentKey])]);

    const { views } = mergearRadar(bundle, {}, 2026);

    expect(views[0].bucket).toBe("NOT_CURATED");
    expect(views[0].isCurated).toBe(false);
  });
});

describe("mergearRadar — herança, staleness e RC mista", () => {
  it("herança PENDING -> OC marca requiresReview e não conta como curada", () => {
    const c = makeCommitment({ rc: "RC2", oc: "OC1", projectId: "P2" });
    const chavePendente = "RC:RC2|OC:PENDING|PPM:P2";
    const curationMap: CurationMap = {
      [chavePendente]: makeCuration(chavePendente, { poStatus: "CONFIRMED", estimatedDeliveryDate: "2026-11-01" }),
    };
    const bundle = makeBundle([c], [makeRcGroup("RC2", [c.commitmentKey])]);

    const { views } = mergearRadar(bundle, curationMap, 2026);

    expect(views[0].requiresReview).toBe(true);
    expect(views[0].isCurated).toBe(false);
    expect(views[0].curation?.inheritedFromKey).toBe(chavePendente);
    expect(views[0].bucket).toBe("CONFIRMED_IN_YEAR");
  });

  it("curadoria stale é detectada", () => {
    const c = makeCommitment({ rc: "RC1", oc: "OC1", projectId: "P1", sourceValue: 1500 });
    const curationMap: CurationMap = {
      [c.commitmentKey]: makeCuration(c.commitmentKey, {
        poStatus: "CONFIRMED",
        estimatedDeliveryDate: "2026-11-01",
        sourceValueAtCuration: 1000,
      }),
    };
    const bundle = makeBundle([c], [makeRcGroup("RC1", [c.commitmentKey])]);

    const { views } = mergearRadar(bundle, curationMap, 2026);

    expect(views[0].isStale).toBe(true);
    expect(views[0].staleDelta).toBeCloseTo(500, 2);
  });

  it("RC com filhas divergentes retorna hasMixedCuration = true", () => {
    const c1 = makeCommitment({ rc: "RC3", oc: "OC1", projectId: "P1" });
    const c2 = makeCommitment({ rc: "RC3", oc: "OC1", projectId: "P2" });
    const curationMap: CurationMap = {
      [c1.commitmentKey]: makeCuration(c1.commitmentKey, { poStatus: "CONFIRMED", estimatedDeliveryDate: "2026-11-01" }),
      [c2.commitmentKey]: makeCuration(c2.commitmentKey, { poStatus: "AT_RISK" }),
    };
    const bundle = makeBundle([c1, c2], [makeRcGroup("RC3", [c1.commitmentKey, c2.commitmentKey])]);

    const { rcViews } = mergearRadar(bundle, curationMap, 2026);

    expect(rcViews[0].hasMixedCuration).toBe(true);
    expect(rcViews[0].effectiveCuration).toBeNull();
  });

  it("reconciles = true num cenário com os 7 baldes preenchidos", () => {
    const confirmedInYear = makeCommitment({ rc: "RC1", oc: "OC1", projectId: "P1", sourceValue: 100 });
    const carryover = makeCommitment({ rc: "RC2", oc: "OC1", projectId: "P2", sourceValue: 200 });
    const confirmedNoDate = makeCommitment({ rc: "RC3", oc: "OC1", projectId: "P3", sourceValue: 300 });
    const atRisk = makeCommitment({ rc: "RC4", oc: "OC1", projectId: "P4", sourceValue: 400 });
    const noVisibility = makeCommitment({ rc: "RC5", oc: "OC1", projectId: "P5", sourceValue: 500 });
    const cancelled = makeCommitment({ rc: "RC6", oc: "OC1", projectId: "P6", sourceValue: 600 });
    const notCurated = makeCommitment({ rc: "RC7", oc: "OC1", projectId: "P7", sourceValue: 700 });

    const commitments = [confirmedInYear, carryover, confirmedNoDate, atRisk, noVisibility, cancelled, notCurated];
    const rcGroups = commitments.map((c) => makeRcGroup(c.rc, [c.commitmentKey]));

    const curationMap: CurationMap = {
      [confirmedInYear.commitmentKey]: makeCuration(confirmedInYear.commitmentKey, {
        poStatus: "CONFIRMED",
        estimatedDeliveryDate: "2026-11-01",
      }),
      [carryover.commitmentKey]: makeCuration(carryover.commitmentKey, {
        poStatus: "CONFIRMED",
        estimatedDeliveryDate: "2026-12-15",
      }),
      [confirmedNoDate.commitmentKey]: makeCuration(confirmedNoDate.commitmentKey, {
        poStatus: "CONFIRMED",
        estimatedDeliveryDate: null,
      }),
      [atRisk.commitmentKey]: makeCuration(atRisk.commitmentKey, { poStatus: "AT_RISK" }),
      [noVisibility.commitmentKey]: makeCuration(noVisibility.commitmentKey, { poStatus: "NO_VISIBILITY" }),
      [cancelled.commitmentKey]: makeCuration(cancelled.commitmentKey, { poStatus: "CANCELLED" }),
      // notCurated não tem entrada no curationMap
    };

    const bundle = makeBundle(commitments, rcGroups);

    const { resumo } = mergearRadar(bundle, curationMap, 2026);

    expect(resumo.buckets.CONFIRMED_IN_YEAR).toBe(100);
    expect(resumo.buckets.CARRYOVER).toBe(200);
    expect(resumo.buckets.CONFIRMED_NO_DATE).toBe(300);
    expect(resumo.buckets.AT_RISK).toBe(400);
    expect(resumo.buckets.NO_VISIBILITY).toBe(500);
    expect(resumo.buckets.CANCELLED).toBe(600);
    expect(resumo.buckets.NOT_CURATED).toBe(700);
    expect(resumo.totalCommitment).toBe(2800);
    expect(resumo.reconciles).toBe(true);
  });
});
