import { describe, expect, it } from "vitest";
import { criarPoolDeTeste } from "../../_lib/testDb";
import { criarReq, criarRes } from "../../_lib/testHttp";
import { handlePutKey } from "./[key]";

describe("PUT /api/curation/key/:commitmentKey", () => {
  it("CONFIRMED sem estimatedDeliveryDate retorna 400 e não grava nada", async () => {
    const pool = criarPoolDeTeste();
    const req = criarReq({
      query: { key: "RC:RC1|OC:OC1|PPM:1" },
      body: { estimatedDeliveryDate: null, poStatus: "CONFIRMED", notes: null, sourceValue: 100 },
    });
    const { res, getStatus, getBody } = criarRes();

    await handlePutKey(pool, req, res);

    expect(getStatus()).toBe(400);
    expect((getBody() as { error: string }).error).toMatch(/estimatedDeliveryDate/i);

    const { rows } = await pool.query("SELECT * FROM commitment_curation");
    expect(rows).toHaveLength(0);
  });

  it("cria (201) e depois atualiza (200) a mesma chave em nível KEY", async () => {
    const pool = criarPoolDeTeste();

    const criacao = criarReq({
      query: { key: "RC:RC1|OC:OC1|PPM:1" },
      body: { estimatedDeliveryDate: "2026-11-01", poStatus: "CONFIRMED", notes: null, sourceValue: 100 },
    });
    const r1 = criarRes();
    await handlePutKey(pool, criacao, r1.res);
    expect(r1.getStatus()).toBe(201);

    const atualizacao = criarReq({
      query: { key: "RC:RC1|OC:OC1|PPM:1" },
      body: { estimatedDeliveryDate: "2026-12-15", poStatus: "CONFIRMED", notes: "atualizado", sourceValue: 150 },
    });
    const r2 = criarRes();
    await handlePutKey(pool, atualizacao, r2.res);
    expect(r2.getStatus()).toBe(200);

    const { rows } = await pool.query("SELECT curation_level, notes FROM commitment_curation WHERE commitment_key = $1", [
      "RC:RC1|OC:OC1|PPM:1",
    ]);
    expect(rows[0].curation_level).toBe("KEY");
    expect(rows[0].notes).toBe("atualizado");
  });

  it("grava decisão NAO_OCORRE sem datas e deriva colunas legadas da opção A", async () => {
    const pool = criarPoolDeTeste();
    const req = criarReq({
      query: { key: "RC:RC9|OC:OC9|PPM:9" },
      body: {
        estimatedDeliveryDate: null,
        poStatus: "NO_VISIBILITY",
        notes: null,
        sourceValue: 250,
        cashForecast: "NAO_OCORRE",
        nonOccurrenceReason: "CANCELAR",
        confidence: "PROVAVEL",
        blocker: "APROVACAO",
        nextAction: "Negociar prazo",
        physicalArrival: true,
        paymentMode: "NORMAL",
        priority: "ALTA",
        decisionStage: "DECISAO_GESTOR",
      },
    });
    const { res, getStatus } = criarRes();

    await handlePutKey(pool, req, res);

    expect(getStatus()).toBe(201);
    const { rows } = await pool.query(
      `SELECT po_status, estimated_delivery_date, cash_forecast, non_occurrence_reason,
              forecast_payment_date, suggested_payment_date, payment_date_adjusted,
              next_action, blocker, payment_mode, priority, decision_stage
       FROM commitment_curation WHERE commitment_key = $1`,
      ["RC:RC9|OC:OC9|PPM:9"]
    );
    expect(rows[0].po_status).toBe("CANCELLED");
    expect(rows[0].estimated_delivery_date).toBeNull();
    expect(rows[0].cash_forecast).toBe("NAO_OCORRE");
    expect(rows[0].non_occurrence_reason).toBe("CANCELAR");
    expect(rows[0].forecast_payment_date).toBeNull();
    expect(rows[0].suggested_payment_date).toBeNull();
    expect(rows[0].payment_date_adjusted).toBeNull();
    expect(rows[0].next_action).toBe("Negociar prazo");
    expect(rows[0].blocker).toBe("APROVACAO");
    expect(rows[0].payment_mode).toBe("NORMAL");
    expect(rows[0].priority).toBe("ALTA");
    expect(rows[0].decision_stage).toBe("DECISAO_GESTOR");
  });

  it("grava decisão com datas e sem cashForecast e deriva colunas legadas da opção A", async () => {
    const pool = criarPoolDeTeste();
    const req = criarReq({
      query: { key: "RC:RC9|OC:OC9|PPM:9" },
      body: {
        estimatedDeliveryDate: null,
        poStatus: "NO_VISIBILITY",
        notes: null,
        sourceValue: 250,
        exerciseYear: 2026,
        forecastPaymentDate: "2026-12-15",
        suggestedPaymentDate: "2026-12-20",
        confidence: "PROVAVEL",
        blocker: "APROVACAO",
        nextAction: "Negociar prazo",
        physicalArrival: true,
        paymentMode: "NORMAL",
        priority: "ALTA",
        decisionStage: "DECISAO_GESTOR",
      },
    });
    const { res, getStatus } = criarRes();

    await handlePutKey(pool, req, res);

    expect(getStatus()).toBe(201);
    const { rows } = await pool.query(
      `SELECT po_status, estimated_delivery_date, cash_forecast, non_occurrence_reason,
              forecast_payment_date, suggested_payment_date, payment_date_adjusted,
              next_action, blocker, payment_mode, priority, decision_stage
       FROM commitment_curation WHERE commitment_key = $1`,
      ["RC:RC9|OC:OC9|PPM:9"]
    );
    expect(rows[0].po_status).toBe("CONFIRMED");
    expect(new Date(rows[0].estimated_delivery_date).toISOString().slice(0, 10)).toBe("2026-11-15");
    expect(rows[0].cash_forecast).toBeNull();
    expect(rows[0].non_occurrence_reason).toBeNull();
    expect(new Date(rows[0].forecast_payment_date).toISOString().slice(0, 10)).toBe("2026-12-15");
    expect(new Date(rows[0].suggested_payment_date).toISOString().slice(0, 10)).toBe("2026-12-20");
    expect(rows[0].payment_date_adjusted).toBe(true);
    expect(rows[0].next_action).toBe("Negociar prazo");
    expect(rows[0].blocker).toBe("APROVACAO");
    expect(rows[0].payment_mode).toBe("NORMAL");
    expect(rows[0].priority).toBe("ALTA");
    expect(rows[0].decision_stage).toBe("DECISAO_GESTOR");
  });

  it("registro com decisão nova + nextAction -> PUT LEGADO zera decisão e preserva nextAction", async () => {
    const pool = criarPoolDeTeste();
    await pool.query(
      `INSERT INTO commitment_curation (commitment_key, estimated_delivery_date, po_status, notes, source_value_at_curation, curation_level, inherited_from_key, updated_by, updated_at, cash_forecast, suggested_payment_date, forecast_payment_date, payment_date_adjusted, payment_exception_reason, confidence, non_occurrence_reason, blocker, next_action, next_action_updated_at, physical_arrival, payment_mode, priority, decision_stage, decision_updated_at)
       VALUES ($1, '2026-12-10', 'CARRYOVER', 'base', 100, 'KEY', NULL, 'tester', now(), 'NAO_OCORRE', '2026-12-20', '2026-12-15', true, 'Ajuste', 'PROVAVEL', 'CANCELAR', 'APROVACAO', 'Negociar compra', now(), true, 'NORMAL', 'ALTA', 'DECISAO_GESTOR', now())`,
      ["RC:RC10|OC:OC10|PPM:10"]
    );

    const req = criarReq({
      query: { key: "RC:RC10|OC:OC10|PPM:10" },
      body: { estimatedDeliveryDate: "2026-11-01", poStatus: "CONFIRMED", notes: "legado", sourceValue: 120 },
    });
    const { res, getStatus } = criarRes();
    await handlePutKey(pool, req, res);

    expect(getStatus()).toBe(200);
    const { rows } = await pool.query(
      `SELECT po_status, cash_forecast, non_occurrence_reason, forecast_payment_date, suggested_payment_date, next_action FROM commitment_curation WHERE commitment_key = $1`,
      ["RC:RC10|OC:OC10|PPM:10"]
    );
    expect(rows[0].po_status).toBe("CONFIRMED");
    expect(rows[0].cash_forecast).toBeNull();
    expect(rows[0].non_occurrence_reason).toBeNull();
    expect(rows[0].forecast_payment_date).toBeNull();
    expect(rows[0].suggested_payment_date).toBeNull();
    expect(rows[0].next_action).toBe("Negociar compra");
  });

  it("registro com decisão nova -> PUT OPERACIONAL só nextAction preserva decisão e po_status", async () => {
    const pool = criarPoolDeTeste();
    await pool.query(
      `INSERT INTO commitment_curation (commitment_key, estimated_delivery_date, po_status, notes, source_value_at_curation, curation_level, inherited_from_key, updated_by, updated_at, cash_forecast, suggested_payment_date, forecast_payment_date, payment_date_adjusted, payment_exception_reason, confidence, non_occurrence_reason, blocker, next_action, next_action_updated_at, physical_arrival, payment_mode, priority, decision_stage, decision_updated_at)
       VALUES ($1, '2026-12-10', 'CARRYOVER', 'base', 100, 'KEY', NULL, 'tester', now(), 'NAO_OCORRE', '2026-12-20', '2026-12-15', true, 'Ajuste', 'PROVAVEL', 'CANCELAR', 'APROVACAO', 'Negociar compra', now(), true, 'NORMAL', 'ALTA', 'DECISAO_GESTOR', now())`,
      ["RC:RC11|OC:OC11|PPM:11"]
    );

    const req = criarReq({
      query: { key: "RC:RC11|OC:OC11|PPM:11" },
      body: { nextAction: "Atualizar plano", sourceValue: 130 },
    });
    const { res, getStatus } = criarRes();
    await handlePutKey(pool, req, res);

    expect(getStatus()).toBe(200);
    const { rows } = await pool.query(
      `SELECT po_status, cash_forecast, forecast_payment_date, next_action FROM commitment_curation WHERE commitment_key = $1`,
      ["RC:RC11|OC:OC11|PPM:11"]
    );
    expect(rows[0].po_status).toBe("CARRYOVER");
    expect(rows[0].cash_forecast).toBe("NAO_OCORRE");
    expect(rows[0].forecast_payment_date).toBeTruthy();
    expect(rows[0].next_action).toBe("Atualizar plano");
  });

  it("registro com nextAction -> PUT DECISAO sem nextAction preserva nextAction", async () => {
    const pool = criarPoolDeTeste();
    await pool.query(
      `INSERT INTO commitment_curation (commitment_key, estimated_delivery_date, po_status, notes, source_value_at_curation, curation_level, inherited_from_key, updated_by, updated_at, cash_forecast, suggested_payment_date, forecast_payment_date, payment_date_adjusted, payment_exception_reason, confidence, non_occurrence_reason, blocker, next_action, next_action_updated_at, physical_arrival, payment_mode, priority, decision_stage, decision_updated_at)
       VALUES ($1, '2026-12-10', 'CONFIRMED', 'base', 100, 'KEY', NULL, 'tester', now(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Revisar contrato', now(), true, 'NORMAL', 'ALTA', 'DECISAO_GESTOR', now())`,
      ["RC:RC12|OC:OC12|PPM:12"]
    );

    const req = criarReq({
      query: { key: "RC:RC12|OC:OC12|PPM:12" },
      body: { estimatedDeliveryDate: "2026-12-15", poStatus: "CONFIRMED", notes: null, sourceValue: 150, exerciseYear: 2026, forecastPaymentDate: "2027-01-10", suggestedPaymentDate: "2027-01-15", confidence: "CONFIRMADO" },
    });
    const { res, getStatus } = criarRes();
    await handlePutKey(pool, req, res);

    expect(getStatus()).toBe(200);
    const { rows } = await pool.query(
      `SELECT next_action, forecast_payment_date, confidence FROM commitment_curation WHERE commitment_key = $1`,
      ["RC:RC12|OC:OC12|PPM:12"]
    );
    expect(rows[0].next_action).toBe("Revisar contrato");
    expect(new Date(rows[0].forecast_payment_date).toISOString().slice(0, 10)).toBe("2027-01-10");
    expect(rows[0].confidence).toBe("CONFIRMADO");
  });

  it("PUT OPERACIONAL em chave inexistente cria com po_status NO_VISIBILITY", async () => {
    const pool = criarPoolDeTeste();
    const req = criarReq({
      query: { key: "RC:RC13|OC:OC13|PPM:13" },
      body: { sourceValue: 200, nextAction: "Acompanhar aprovação" },
    });
    const { res, getStatus } = criarRes();

    await handlePutKey(pool, req, res);

    expect(getStatus()).toBe(201);
    const { rows } = await pool.query(
      `SELECT po_status, next_action FROM commitment_curation WHERE commitment_key = $1`,
      ["RC:RC13|OC:OC13|PPM:13"]
    );
    expect(rows[0].po_status).toBe("NO_VISIBILITY");
    expect(rows[0].next_action).toBe("Acompanhar aprovação");
  });

  it("forecastPaymentDate sem exerciseYear retorna 400", async () => {
    const pool = criarPoolDeTeste();
    const req = criarReq({
      query: { key: "RC:RC14|OC:OC14|PPM:14" },
      body: { estimatedDeliveryDate: null, poStatus: "NO_VISIBILITY", notes: null, sourceValue: 10, forecastPaymentDate: "2026-12-15" },
    });
    const { res, getStatus, getBody } = criarRes();

    await handlePutKey(pool, req, res);

    expect(getStatus()).toBe(400);
    expect((getBody() as { error: string }).error).toMatch(/exerciseYear/i);
  });

  it("rejeita cashForecast NAO_OCORRE com forecastPaymentDate", async () => {
    const pool = criarPoolDeTeste();
    const req = criarReq({
      query: { key: "RC:RC15|OC:OC15|PPM:15" },
      body: {
        estimatedDeliveryDate: null,
        poStatus: "NO_VISIBILITY",
        notes: null,
        sourceValue: 50,
        exerciseYear: 2026,
        cashForecast: "NAO_OCORRE",
        forecastPaymentDate: "2026-12-15",
      },
    });
    const { res, getStatus, getBody } = criarRes();

    await handlePutKey(pool, req, res);

    expect(getStatus()).toBe(400);
    expect((getBody() as { error: string }).error).toMatch(/cashForecast/i);
  });

  it("rejeita nonOccurrenceReason sem cashForecast NAO_OCORRE", async () => {
    const pool = criarPoolDeTeste();
    const req = criarReq({
      query: { key: "RC:RC16|OC:OC16|PPM:16" },
      body: {
        estimatedDeliveryDate: null,
        poStatus: "NO_VISIBILITY",
        notes: null,
        sourceValue: 60,
        nonOccurrenceReason: "REDUZIR",
      },
    });
    const { res, getStatus, getBody } = criarRes();

    await handlePutKey(pool, req, res);

    expect(getStatus()).toBe(400);
    expect((getBody() as { error: string }).error).toMatch(/nonOccurrenceReason/i);
  });
});
