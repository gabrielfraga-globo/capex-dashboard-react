import { describe, expect, it } from "vitest";
import { criarPoolDeTeste } from "../../../api/_lib/testDb";
import { mergearRadar } from "./merge";
import { readDecision } from "./decision";
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

describe("003_decisao_gestor migration constraints", () => {
  it("aplica as constraints do modelo de decisão do gestor", async () => {
    const pool = criarPoolDeTeste();

    await expect(pool.query(`
      INSERT INTO commitment_curation (
        commitment_key, estimated_delivery_date, po_status, notes, source_value_at_curation,
        curation_level, inherited_from_key, updated_by, updated_at,
        cash_forecast, suggested_payment_date, forecast_payment_date, payment_date_adjusted,
        payment_exception_reason, confidence, non_occurrence_reason, blocker,
        next_action, next_action_updated_at, physical_arrival, payment_mode, priority,
        decision_stage, decision_updated_at
      ) VALUES (
        'RC:RC4|OC:OC4|PPM:4', '2026-11-20', 'CONFIRMED', null, 1000,
        'RC', null, 'tester', '2026-09-26T00:00:00.000Z',
        'NAO_OCORRE', '2027-01-15', '2027-01-10', true,
        'Ajuste do prazo', 'CONFIRMADO', null, 'SEM_BLOQUEIO',
        'Validar compra', '2026-09-26T00:00:00.000Z', true, 'NORMAL', 'ALTA',
        'EM_AVALIACAO', '2026-09-26T00:00:00.000Z'
      )
    `)).rejects.toThrow();

    await expect(pool.query(`
      INSERT INTO commitment_curation (
        commitment_key, estimated_delivery_date, po_status, notes, source_value_at_curation,
        curation_level, inherited_from_key, updated_by, updated_at,
        cash_forecast, suggested_payment_date, forecast_payment_date, payment_date_adjusted,
        payment_exception_reason, confidence, non_occurrence_reason, blocker,
        next_action, next_action_updated_at, physical_arrival, payment_mode, priority,
        decision_stage, decision_updated_at
      ) VALUES (
        'RC:RC5|OC:OC5|PPM:5', '2026-11-20', 'CONFIRMED', null, 1000,
        'RC', null, 'tester', '2026-09-26T00:00:00.000Z',
        'NAO_OCORRE', null, '2027-01-10', false,
        'Ajuste do prazo', 'CONFIRMADO', 'LEGADO', 'SEM_BLOQUEIO',
        'Validar compra', '2026-09-26T00:00:00.000Z', true, 'NORMAL', 'ALTA',
        'EM_AVALIACAO', '2026-09-26T00:00:00.000Z'
      )
    `)).resolves.toBeDefined();

    await expect(pool.query(`
      INSERT INTO commitment_curation (
        commitment_key, estimated_delivery_date, po_status, notes, source_value_at_curation,
        curation_level, inherited_from_key, updated_by, updated_at,
        cash_forecast, suggested_payment_date, forecast_payment_date, payment_date_adjusted,
        payment_exception_reason, confidence, non_occurrence_reason, blocker,
        next_action, next_action_updated_at, physical_arrival, payment_mode, priority,
        decision_stage, decision_updated_at
      ) VALUES (
        'RC:RC6|OC:OC6|PPM:6', '2026-11-20', 'CONFIRMED', null, 1000,
        'RC', null, 'tester', '2026-09-26T00:00:00.000Z',
        null, '2027-01-15', null, true,
        'Ajuste do prazo', 'CONFIRMADO', null, 'SEM_BLOQUEIO',
        'Validar compra', '2026-09-26T00:00:00.000Z', true, 'NORMAL', 'ALTA',
        'EM_AVALIACAO', '2026-09-26T00:00:00.000Z'
      )
    `)).rejects.toThrow();
  });
});
