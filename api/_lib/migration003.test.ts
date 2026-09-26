import { describe, expect, it } from "vitest";
import { criarPoolDeTeste } from "./testDb";

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
