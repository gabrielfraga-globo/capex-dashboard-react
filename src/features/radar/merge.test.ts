import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergearRadar } from "./merge";
import { mascaraParaIso } from "./dateMask";
import { derivarPoStatus, RADAR_CARD_BUCKETS } from "./types";
import type { CommitmentCuration, CommitmentSource, CommitmentSourceBundle, CurationMap, RcGroup } from "./types";

function parseDecimalPtBr(value: string): number {
  const normalized = value.trim().replace(/^"|"$/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCsvRows(csv: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = csv.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ";") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  const headers = rows[0] ?? [];
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header.trim(), values[index]?.trim() ?? ""])));
}

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

describe("derivarPoStatus — limites do exercício", () => {
  it("classifica as datas pelos limites derivados do ano", () => {
    expect(derivarPoStatus(null, 2026)).toBe("NO_VISIBILITY");
    expect(derivarPoStatus("2026-11-14", 2026)).toBe("CONFIRMED");
    expect(derivarPoStatus("2026-11-15", 2026)).toBe("AT_RISK");
    expect(derivarPoStatus("2026-11-30", 2026)).toBe("AT_RISK");
    expect(derivarPoStatus("2026-12-01", 2026)).toBe("CARRYOVER");
    expect(derivarPoStatus("2027-11-14", 2027)).toBe("CONFIRMED");
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
      [c.commitmentKey]: makeCuration(c.commitmentKey, { poStatus: "AT_RISK", estimatedDeliveryDate: "2026-11-20" }),
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

  it("os cards apontam diretamente para os buckets correspondentes", () => {
    expect(RADAR_CARD_BUCKETS).toEqual({
      bgTimes: "CONFIRMED_IN_YEAR",
      carryover: "CARRYOVER",
      notCurated: "NOT_CURATED",
    });
  });

  it("reconcilia bundle, CSV e os 7 buckets sem baseline fixo", () => {
    const bundlePath = new URL("../../../public/data/radar-bundle.json", import.meta.url);
    const csvPath = new URL("../../../public/data/compromissos_detalhados.csv", import.meta.url);
    const bundle = JSON.parse(readFileSync(bundlePath, "utf-8")) as CommitmentSourceBundle;
    const csvRows = parseCsvRows(readFileSync(csvPath, "utf-8"));
    const csvTotal = csvRows.reduce((total, row) => total + parseDecimalPtBr(row.ValorCompromisso ?? ""), 0);
    const bundleTotal = bundle.commitments.reduce((total, commitment) => total + commitment.sourceValue, 0);

    const { resumo } = mergearRadar(bundle, {}, 2026);

    expect(bundleTotal).toBeCloseTo(csvTotal, 2);
    expect(resumo.totalCommitment).toBeCloseTo(bundleTotal, 2);
    expect(Object.values(resumo.buckets).reduce((total, value) => total + value, 0)).toBeCloseTo(bundleTotal, 2);
    expect(resumo.reconciles).toBe(true);
    expect(bundle.commitments.every((commitment) => commitment.requestDescription)).toBe(true);
  });

  it("soma no carryover as três RCs de referência", () => {
    const sourceBundle = JSON.parse(
      readFileSync(new URL("../../../public/data/radar-bundle.json", import.meta.url), "utf-8")
    ) as CommitmentSourceBundle;
    const datesByRc: Record<string, string> = {
      RCGSP10058458: "2026-12-31",
      RCGRJ10639869: "2026-12-01",
      RCGSP10074213: "2026-12-01",
    };
    const commitments = sourceBundle.commitments.filter((commitment) => commitment.rc in datesByRc);
    const rcGroups = sourceBundle.rcGroups.filter((group) => group.rc in datesByRc);
    const curationMap = Object.fromEntries(commitments.map((commitment) => [
      commitment.commitmentKey,
      makeCuration(commitment.commitmentKey, {
        poStatus: "CONFIRMED",
        estimatedDeliveryDate: datesByRc[commitment.rc],
      }),
    ]));

    const { views, resumo } = mergearRadar(makeBundle(commitments, rcGroups), curationMap, 2026);

    expect(views.every((view) => view.bucket === "CARRYOVER")).toBe(true);
    expect(resumo.buckets.CARRYOVER).toBe(159_444.1);
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

  it("respeita as fronteiras do exercício e reconcilia os 7 baldes", () => {
    const confirmedInYear = makeCommitment({ rc: "RC1", oc: "OC1", projectId: "P1", sourceValue: 100 });
    const atRiskStart = makeCommitment({ rc: "RC2", oc: "OC1", projectId: "P2", sourceValue: 200 });
    const atRiskEnd = makeCommitment({ rc: "RC3", oc: "OC1", projectId: "P3", sourceValue: 300 });
    const carryover = makeCommitment({ rc: "RC4", oc: "OC1", projectId: "P4", sourceValue: 400 });
    const confirmedNoDate = makeCommitment({ rc: "RC5", oc: "OC1", projectId: "P5", sourceValue: 500 });
    const noVisibility = makeCommitment({ rc: "RC6", oc: "OC1", projectId: "P6", sourceValue: 600 });
    const cancelled = makeCommitment({ rc: "RC7", oc: "OC1", projectId: "P7", sourceValue: 700 });
    const notCurated = makeCommitment({ rc: "RC8", oc: "OC1", projectId: "P8", sourceValue: 800 });

    const commitments = [confirmedInYear, atRiskStart, atRiskEnd, carryover, confirmedNoDate, noVisibility, cancelled, notCurated];
    const rcGroups = commitments.map((c) => makeRcGroup(c.rc, [c.commitmentKey]));

    const curationMap: CurationMap = {
      [confirmedInYear.commitmentKey]: makeCuration(confirmedInYear.commitmentKey, {
        poStatus: "CONFIRMED",
        estimatedDeliveryDate: "2026-11-14",
      }),
      [atRiskStart.commitmentKey]: makeCuration(atRiskStart.commitmentKey, {
        poStatus: "CONFIRMED",
        estimatedDeliveryDate: "2026-11-15",
      }),
      [atRiskEnd.commitmentKey]: makeCuration(atRiskEnd.commitmentKey, {
        poStatus: "CONFIRMED",
        estimatedDeliveryDate: "2026-11-30",
      }),
      [carryover.commitmentKey]: makeCuration(carryover.commitmentKey, {
        poStatus: "CONFIRMED",
        estimatedDeliveryDate: "2026-12-01",
      }),
      [confirmedNoDate.commitmentKey]: makeCuration(confirmedNoDate.commitmentKey, {
        poStatus: "CONFIRMED",
        estimatedDeliveryDate: null,
      }),
      [noVisibility.commitmentKey]: makeCuration(noVisibility.commitmentKey, { poStatus: "NO_VISIBILITY" }),
      [cancelled.commitmentKey]: makeCuration(cancelled.commitmentKey, { poStatus: "CANCELLED" }),
      // notCurated não tem entrada no curationMap
    };

    const bundle = makeBundle(commitments, rcGroups);

    const { resumo } = mergearRadar(bundle, curationMap, 2026);

    expect(resumo.buckets.CONFIRMED_IN_YEAR).toBe(100);
    expect(resumo.buckets.CARRYOVER).toBe(400);
    expect(resumo.buckets.CONFIRMED_NO_DATE).toBe(500);
    expect(resumo.buckets.AT_RISK).toBe(500);
    expect(resumo.buckets.NO_VISIBILITY).toBe(600);
    expect(resumo.buckets.CANCELLED).toBe(700);
    expect(resumo.buckets.NOT_CURATED).toBe(800);
    expect(resumo.totalCommitment).toBe(3600);
    expect(Object.values(resumo.buckets).reduce((total, value) => total + value, 0)).toBe(resumo.totalCommitment);
    expect(resumo.reconciles).toBe(true);
  });
});
