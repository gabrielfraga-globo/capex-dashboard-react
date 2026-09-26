import { describe, expect, it } from "vitest";
import { readDecision } from "../../src/features/radar/decision";
import { mergearRadar } from "../../src/features/radar/merge";
import { buildCurationWrite, rowToCuration } from "./curationColumns";

describe("curationColumns", () => {
  it("deriva colunas legadas da opção A quando há decisão nova", () => {
    const write = buildCurationWrite(
      {
        estimatedDeliveryDate: null,
        poStatus: "CONFIRMED",
        notes: null,
        sourceValue: 100,
        forecastPaymentDate: "2026-12-15",
        suggestedPaymentDate: "2026-12-20",
        cashForecast: "NAO_OCORRE",
        nonOccurrenceReason: "CANCELAR",
        confidence: "PROVAVEL",
        blocker: "APROVACAO",
        nextAction: "Negociar",
        paymentMode: "NORMAL",
        physicalArrival: true,
        priority: "ALTA",
        decisionStage: "DECISAO_GESTOR",
        exerciseYear: 2026,
      },
      2026
    );

    expect(write.mode).toBe("DECISAO");
    expect(write.columns.po_status).toBe("CANCELLED");
    expect(write.columns.estimated_delivery_date).toBeNull();
    expect(write.columns.cash_forecast).toBe("NAO_OCORRE");
    expect(write.columns.non_occurrence_reason).toBe("CANCELAR");
    expect(write.columns.payment_date_adjusted).toBe(true);
    expect(write.columns.decision_updated_at).toBeTruthy();
    expect(write.columns.next_action_updated_at).toBeTruthy();
  });

  it("faz o zeramento da regra última gravação vence quando o PUT é legado", () => {
    const write = buildCurationWrite(
      {
        estimatedDeliveryDate: "2026-11-10",
        poStatus: "CONFIRMED",
        notes: "legado",
        sourceValue: 100,
      },
      2026
    );

    expect(write.mode).toBe("LEGADO");
    expect(write.columns.po_status).toBe("CONFIRMED");
    expect(write.columns.estimated_delivery_date).toBe("2026-11-10");
    expect(write.columns.cash_forecast).toBeNull();
    expect(write.columns.non_occurrence_reason).toBeNull();
    expect(write.columns.forecast_payment_date).toBeNull();
    expect(write.columns.suggested_payment_date).toBeNull();
    expect(write.columns.payment_date_adjusted).toBeNull();
  });

  it("mapeia linha do banco para o shape camelCase com nulls preservados", () => {
    const row = {
      commitment_key: "RC:RC1|OC:OC1|PPM:1",
      estimated_delivery_date: "2026-11-15",
      po_status: "CONFIRMED",
      notes: null,
      source_value_at_curation: 100,
      curation_level: "KEY",
      inherited_from_key: null,
      updated_by: "gestor@g.globo",
      updated_at: "2026-09-26T12:00:00.000Z",
      cash_forecast: null,
      suggested_payment_date: null,
      forecast_payment_date: "2026-12-12",
      payment_date_adjusted: false,
      payment_exception_reason: null,
      confidence: "CONFIRMADO",
      non_occurrence_reason: null,
      blocker: "APROVACAO",
      next_action: "Negociar",
      next_action_updated_at: "2026-09-25T12:00:00.000Z",
      physical_arrival: true,
      payment_mode: "NORMAL",
      priority: "ALTA",
      decision_stage: "DECISAO_GESTOR",
      decision_updated_at: "2026-09-26T12:05:00.000Z",
    };

    expect(rowToCuration(row)).toMatchObject({
      commitmentKey: "RC:RC1|OC:OC1|PPM:1",
      estimatedDeliveryDate: "2026-11-15",
      poStatus: "CONFIRMED",
      notes: null,
      sourceValueAtCuration: 100,
      curationLevel: "KEY",
      inheritedFromKey: null,
      updatedBy: "gestor@g.globo",
      updatedAt: "2026-09-26T12:00:00.000Z",
      cashForecast: null,
      suggestedPaymentDate: null,
      forecastPaymentDate: "2026-12-12",
      paymentDateAdjusted: false,
      confidence: "CONFIRMADO",
      blocker: "APROVACAO",
      nextAction: "Negociar",
      nextActionUpdatedAt: "2026-09-25T12:00:00.000Z",
      physicalArrival: true,
      paymentMode: "NORMAL",
      priority: "ALTA",
      decisionStage: "DECISAO_GESTOR",
      decisionUpdatedAt: "2026-09-26T12:05:00.000Z",
    });
  });

  it.each([
    {
      name: "EXERCICIO sem ajuste",
      body: {
        estimatedDeliveryDate: null,
        poStatus: "NO_VISIBILITY",
        notes: null,
        sourceValue: 100,
        exerciseYear: 2026,
        forecastPaymentDate: "2026-10-20",
        suggestedPaymentDate: "2026-10-20",
      },
      expectedForecastPaymentDate: "2026-10-20",
      expectedCashForecast: "CAIXA_EXERCICIO",
      expectedCashYear: 2026,
      expectedBucket: "CONFIRMED_IN_YEAR",
    },
    {
      name: "EXERCICIO com data em dezembro",
      body: {
        estimatedDeliveryDate: null,
        poStatus: "NO_VISIBILITY",
        notes: null,
        sourceValue: 100,
        exerciseYear: 2026,
        forecastPaymentDate: "2026-12-10",
        suggestedPaymentDate: "2026-12-10",
      },
      expectedForecastPaymentDate: "2026-12-10",
      expectedCashForecast: "CAIXA_EXERCICIO",
      expectedCashYear: 2026,
      expectedBucket: "CONFIRMED_IN_YEAR",
    },
    {
      name: "PROXIMO",
      body: {
        estimatedDeliveryDate: null,
        poStatus: "NO_VISIBILITY",
        notes: null,
        sourceValue: 100,
        exerciseYear: 2026,
        forecastPaymentDate: "2027-01-15",
        suggestedPaymentDate: "2027-01-15",
      },
      expectedForecastPaymentDate: "2027-01-15",
      expectedCashForecast: "CAIXA_PROXIMO_EXERCICIO",
      expectedCashYear: 2027,
      expectedBucket: "CARRYOVER",
    },
    {
      name: "NAO_OCORRE",
      body: {
        estimatedDeliveryDate: null,
        poStatus: "NO_VISIBILITY",
        notes: null,
        sourceValue: 100,
        exerciseYear: 2026,
        cashForecast: "NAO_OCORRE",
        nonOccurrenceReason: "CANCELAR",
      },
      expectedForecastPaymentDate: null,
      expectedCashForecast: "NAO_OCORRE",
      expectedCashYear: null,
      expectedBucket: "CANCELLED",
    },
  ])("gravação da decisão do gestor em 3 modos – $name", ({ body, expectedForecastPaymentDate, expectedCashForecast, expectedCashYear, expectedBucket }) => {
    const write = buildCurationWrite(body, 2026);
    const row = {
      commitment_key: "RC:RC1|OC:OC1|PPM:1",
      estimated_delivery_date: write.columns.estimated_delivery_date ?? null,
      po_status: write.columns.po_status ?? "NO_VISIBILITY",
      notes: write.columns.notes ?? null,
      source_value_at_curation: 100,
      curation_level: "RC",
      inherited_from_key: null,
      updated_by: "tester@g.globo",
      updated_at: "2026-09-26T00:00:00.000Z",
      cash_forecast: write.columns.cash_forecast ?? null,
      suggested_payment_date: write.columns.suggested_payment_date ?? null,
      forecast_payment_date: write.columns.forecast_payment_date ?? null,
      payment_date_adjusted: write.columns.payment_date_adjusted ?? null,
      payment_exception_reason: write.columns.payment_exception_reason ?? null,
      confidence: write.columns.confidence ?? null,
      non_occurrence_reason: write.columns.non_occurrence_reason ?? null,
      blocker: write.columns.blocker ?? null,
      next_action: write.columns.next_action ?? null,
      next_action_updated_at: write.columns.next_action_updated_at ?? null,
      physical_arrival: write.columns.physical_arrival ?? null,
      payment_mode: write.columns.payment_mode ?? null,
      priority: write.columns.priority ?? null,
      decision_stage: write.columns.decision_stage ?? null,
      decision_updated_at: write.columns.decision_updated_at ?? null,
    };

    const curation = rowToCuration(row);
    const decision = readDecision(curation, 2026, "2026-09-26");
    const bundle = {
      generatedAt: "2026-09-26T00:00:00.000Z",
      exerciseYear: 2026,
      commitments: [{
        commitmentKey: "RC:RC1|OC:OC1|PPM:1",
        rc: "RC1",
        oc: "OC1",
        projectId: "P1",
        projectName: "Projeto Teste",
        rubrica: "MDO",
        supplier: "Fornecedor Teste",
        systemStatus: "OPEN",
        systemPromisedDate: null,
        systemNeedDate: null,
        sourceValue: 100,
        lineCount: 1,
        details: [],
      }],
      rcGroups: [{
        rc: "RC1",
        commitmentKeys: ["RC:RC1|OC:OC1|PPM:1"],
        totalValue: 100,
        projectIds: ["P1"],
        suppliers: ["Fornecedor Teste"],
        ocs: ["OC1"],
        isHeterogeneous: false,
        heterogeneityReasons: [],
        splitsExercise: false,
      }],
      discardedLines: 0,
      totals: { value: 100, lines: 1, keys: 1, rcs: 1 },
    };

    expect(decision.origin).toBe("NOVO");
    expect(decision.forecastPaymentDate).toBe(expectedForecastPaymentDate);
    expect(decision.cashForecast).toBe(expectedCashForecast);
    expect(decision.cashYear).toBe(expectedCashYear);
    if (expectedForecastPaymentDate == null) {
      expect(decision.nonOccurrenceReason).toBe("CANCELAR");
    }

    const { views } = mergearRadar(bundle as any, { [curation.commitmentKey]: curation }, 2026);
    expect(views[0].bucket).toBe(expectedBucket);
  });
});
