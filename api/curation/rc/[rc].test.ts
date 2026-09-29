import { beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { criarPoolDeTeste } from "../../_lib/testDb";
import { criarReq, criarRes } from "../../_lib/testHttp";
import { handlePutRc } from "./[rc]";

describe("PUT /api/curation/rc/:rc", () => {
  let pool: Pool;

  beforeEach(() => {
    pool = criarPoolDeTeste();
  });

  it("grava os 2 targets da RC numa única transação, com auditoria", async () => {
    const req = criarReq({
      query: { rc: "RC1" },
      body: {
        estimatedDeliveryDate: "2026-11-01",
        poStatus: "CONFIRMED",
        notes: "Fornecedor confirmou embarque",
        sourceValue: 0,
        targets: [
          { commitmentKey: "RC:RC1|OC:OC1|PPM:1", sourceValue: 1000 },
          { commitmentKey: "RC:RC1|OC:OC1|PPM:2", sourceValue: 2000 },
        ],
      },
    });
    const { res, getStatus, getBody } = criarRes();

    await handlePutRc(pool, req, res);

    expect(getStatus()).toBe(200);
    const body = getBody() as { rc: string; written: string[]; preserved: string[] };
    expect(body.rc).toBe("RC1");
    expect(body.written).toEqual(["RC:RC1|OC:OC1|PPM:1", "RC:RC1|OC:OC1|PPM:2"]);
    expect(body.preserved).toEqual([]);

    const { rows } = await pool.query(
      "SELECT commitment_key, source_value_at_curation, curation_level FROM commitment_curation ORDER BY commitment_key"
    );
    expect(rows).toHaveLength(2);
    expect(Number(rows[0].source_value_at_curation)).toBe(1000);
    expect(Number(rows[1].source_value_at_curation)).toBe(2000);
    expect(rows.every((r) => r.curation_level === "RC")).toBe(true);

    const audit = await pool.query("SELECT commitment_key, action FROM curation_audit ORDER BY commitment_key");
    expect(audit.rows).toHaveLength(2);
    expect(audit.rows.every((r) => r.action === "RC_UPSERT")).toBe(true);
  });

  it("preserva filha já curada em nível KEY e não a audita", async () => {
    await pool.query(
      `INSERT INTO commitment_curation
         (commitment_key, estimated_delivery_date, po_status, notes, source_value_at_curation, curation_level, inherited_from_key, updated_by, updated_at)
       VALUES ($1, NULL, 'AT_RISK', NULL, 500, 'KEY', NULL, 'outrogestor@g.globo', now())`,
      ["RC:RC2|OC:OC1|PPM:2"]
    );

    const req = criarReq({
      query: { rc: "RC2" },
      body: {
        estimatedDeliveryDate: "2026-11-01",
        poStatus: "CONFIRMED",
        notes: null,
        sourceValue: 0,
        targets: [
          { commitmentKey: "RC:RC2|OC:OC1|PPM:1", sourceValue: 1000 },
          { commitmentKey: "RC:RC2|OC:OC1|PPM:2", sourceValue: 2000 },
        ],
      },
    });
    const { res, getStatus, getBody } = criarRes();

    await handlePutRc(pool, req, res);

    expect(getStatus()).toBe(200);
    const body = getBody() as { written: string[]; preserved: string[] };
    expect(body.written).toEqual(["RC:RC2|OC:OC1|PPM:1"]);
    expect(body.preserved).toEqual(["RC:RC2|OC:OC1|PPM:2"]);

    const preservedRow = await pool.query(
      "SELECT po_status, curation_level, updated_by FROM commitment_curation WHERE commitment_key = $1",
      ["RC:RC2|OC:OC1|PPM:2"]
    );
    expect(preservedRow.rows[0].po_status).toBe("AT_RISK");
    expect(preservedRow.rows[0].curation_level).toBe("KEY");
    expect(preservedRow.rows[0].updated_by).toBe("outrogestor@g.globo");

    const audit = await pool.query("SELECT commitment_key FROM curation_audit");
    expect(audit.rows.map((r) => r.commitment_key)).toEqual(["RC:RC2|OC:OC1|PPM:1"]);
  });

  it("grava decisão por RC com data do próximo exercício e deriva as colunas legadas da opção A", async () => {
    const req = criarReq({
      query: { rc: "RC9" },
      body: {
        estimatedDeliveryDate: null,
        poStatus: "NO_VISIBILITY",
        notes: null,
        sourceValue: 0,
        exerciseYear: 2026,
        forecastPaymentDate: "2027-01-10",
        suggestedPaymentDate: "2027-01-15",
        confidence: "INCERTO",
        blocker: "COTACAO_LICITACAO",
        nextAction: "Revisar compra",
        physicalArrival: false,
        paymentMode: "ANTECIPADO",
        priority: "MEDIA",
        decisionStage: "GESTAO",
        targets: [
          { commitmentKey: "RC:RC9|OC:OC9|PPM:9", sourceValue: 500 },
        ],
      },
    });
    const { res, getStatus } = criarRes();

    await handlePutRc(pool, req, res);

    expect(getStatus()).toBe(200);
    const { rows } = await pool.query(
      `SELECT po_status, estimated_delivery_date, cash_forecast, non_occurrence_reason,
              payment_date_adjusted, forecast_payment_date, suggested_payment_date,
              next_action, blocker, payment_mode, priority, decision_stage
       FROM commitment_curation WHERE commitment_key = $1`,
      ["RC:RC9|OC:OC9|PPM:9"]
    );
    expect(rows[0].po_status).toBe("CARRYOVER");
    expect(new Date(rows[0].estimated_delivery_date).toISOString().slice(0, 10)).toBe("2026-12-11");
    expect(rows[0].cash_forecast).toBeNull();
    expect(rows[0].non_occurrence_reason).toBeNull();
    expect(rows[0].payment_date_adjusted).toBe(true);
    expect(new Date(rows[0].forecast_payment_date).toISOString().slice(0, 10)).toBe("2027-01-10");
    expect(new Date(rows[0].suggested_payment_date).toISOString().slice(0, 10)).toBe("2027-01-15");
    expect(rows[0].next_action).toBe("Revisar compra");
    expect(rows[0].blocker).toBe("COTACAO_LICITACAO");
    expect(rows[0].payment_mode).toBe("ANTECIPADO");
    expect(rows[0].priority).toBe("MEDIA");
    expect(rows[0].decision_stage).toBe("GESTAO");
  });

  it("registro com decisão nova + nextAction -> PUT LEGADO por RC zera decisão e preserva nextAction", async () => {
    await pool.query(
      `INSERT INTO commitment_curation (commitment_key, estimated_delivery_date, po_status, notes, source_value_at_curation, curation_level, inherited_from_key, updated_by, updated_at, cash_forecast, suggested_payment_date, forecast_payment_date, payment_date_adjusted, payment_exception_reason, confidence, non_occurrence_reason, blocker, next_action, next_action_updated_at, physical_arrival, payment_mode, priority, decision_stage, decision_updated_at)
       VALUES ($1, '2026-12-10', 'CARRYOVER', 'base', 100, 'RC', NULL, 'tester', now(), 'NAO_OCORRE', '2026-12-20', '2026-12-15', true, 'Ajuste', 'PROVAVEL', 'CANCELAR', 'APROVACAO', 'Negociar compra', now(), true, 'NORMAL', 'ALTA', 'DECISAO_GESTOR', now())`,
      ["RC:RC20|OC:OC20|PPM:20"]
    );

    const req = criarReq({
      query: { rc: "RC20" },
      body: { estimatedDeliveryDate: "2026-11-01", poStatus: "CONFIRMED", notes: "legado", targets: [{ commitmentKey: "RC:RC20|OC:OC20|PPM:20", sourceValue: 120 }] },
    });
    const { res, getStatus } = criarRes();
    await handlePutRc(pool, req, res);

    expect(getStatus()).toBe(200);
    const { rows } = await pool.query(
      `SELECT po_status, cash_forecast, non_occurrence_reason, forecast_payment_date, suggested_payment_date, next_action FROM commitment_curation WHERE commitment_key = $1`,
      ["RC:RC20|OC:OC20|PPM:20"]
    );
    expect(rows[0].po_status).toBe("CONFIRMED");
    expect(rows[0].cash_forecast).toBeNull();
    expect(rows[0].non_occurrence_reason).toBeNull();
    expect(rows[0].forecast_payment_date).toBeNull();
    expect(rows[0].suggested_payment_date).toBeNull();
    expect(rows[0].next_action).toBe("Negociar compra");
  });

  it("registro com decisão nova -> PUT OPERACIONAL por RC só nextAction preserva decisão e po_status", async () => {
    await pool.query(
      `INSERT INTO commitment_curation (commitment_key, estimated_delivery_date, po_status, notes, source_value_at_curation, curation_level, inherited_from_key, updated_by, updated_at, cash_forecast, suggested_payment_date, forecast_payment_date, payment_date_adjusted, payment_exception_reason, confidence, non_occurrence_reason, blocker, next_action, next_action_updated_at, physical_arrival, payment_mode, priority, decision_stage, decision_updated_at)
       VALUES ($1, '2026-12-10', 'CARRYOVER', 'base', 100, 'RC', NULL, 'tester', now(), 'NAO_OCORRE', '2026-12-20', '2026-12-15', true, 'Ajuste', 'PROVAVEL', 'CANCELAR', 'APROVACAO', 'Negociar compra', now(), true, 'NORMAL', 'ALTA', 'DECISAO_GESTOR', now())`,
      ["RC:RC21|OC:OC21|PPM:21"]
    );

    const req = criarReq({
      query: { rc: "RC21" },
      body: { nextAction: "Atualizar plano", targets: [{ commitmentKey: "RC:RC21|OC:OC21|PPM:21", sourceValue: 130 }] },
    });
    const { res, getStatus } = criarRes();
    await handlePutRc(pool, req, res);

    expect(getStatus()).toBe(200);
    const { rows } = await pool.query(
      `SELECT po_status, cash_forecast, forecast_payment_date, next_action FROM commitment_curation WHERE commitment_key = $1`,
      ["RC:RC21|OC:OC21|PPM:21"]
    );
    expect(rows[0].po_status).toBe("CARRYOVER");
    expect(rows[0].cash_forecast).toBe("NAO_OCORRE");
    expect(rows[0].forecast_payment_date).toBeTruthy();
    expect(rows[0].next_action).toBe("Atualizar plano");
  });

  it("registro com nextAction -> PUT DECISAO por RC sem nextAction preserva nextAction", async () => {
    await pool.query(
      `INSERT INTO commitment_curation (commitment_key, estimated_delivery_date, po_status, notes, source_value_at_curation, curation_level, inherited_from_key, updated_by, updated_at, cash_forecast, suggested_payment_date, forecast_payment_date, payment_date_adjusted, payment_exception_reason, confidence, non_occurrence_reason, blocker, next_action, next_action_updated_at, physical_arrival, payment_mode, priority, decision_stage, decision_updated_at)
       VALUES ($1, '2026-12-10', 'CONFIRMED', 'base', 100, 'RC', NULL, 'tester', now(), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Revisar contrato', now(), true, 'NORMAL', 'ALTA', 'DECISAO_GESTOR', now())`,
      ["RC:RC22|OC:OC22|PPM:22"]
    );

    const req = criarReq({
      query: { rc: "RC22" },
      body: { estimatedDeliveryDate: "2026-12-15", poStatus: "CONFIRMED", notes: null, exerciseYear: 2026, forecastPaymentDate: "2027-01-10", suggestedPaymentDate: "2027-01-15", confidence: "CONFIRMADO", targets: [{ commitmentKey: "RC:RC22|OC:OC22|PPM:22", sourceValue: 150 }] },
    });
    const { res, getStatus } = criarRes();
    await handlePutRc(pool, req, res);

    expect(getStatus()).toBe(200);
    const { rows } = await pool.query(
      `SELECT next_action, forecast_payment_date, confidence FROM commitment_curation WHERE commitment_key = $1`,
      ["RC:RC22|OC:OC22|PPM:22"]
    );
    expect(rows[0].next_action).toBe("Revisar contrato");
    expect(new Date(rows[0].forecast_payment_date).toISOString().slice(0, 10)).toBe("2027-01-10");
    expect(rows[0].confidence).toBe("CONFIRMADO");
  });

  it("PUT OPERACIONAL em chave inexistente por RC cria com po_status NO_VISIBILITY", async () => {
    const req = criarReq({
      query: { rc: "RC23" },
      body: { nextAction: "Acompanhar aprovação", targets: [{ commitmentKey: "RC:RC23|OC:OC23|PPM:23", sourceValue: 200 }] },
    });
    const { res, getStatus } = criarRes();

    await handlePutRc(pool, req, res);

    expect(getStatus()).toBe(200);
    const { rows } = await pool.query(
      `SELECT po_status, next_action FROM commitment_curation WHERE commitment_key = $1`,
      ["RC:RC23|OC:OC23|PPM:23"]
    );
    expect(rows[0].po_status).toBe("NO_VISIBILITY");
    expect(rows[0].next_action).toBe("Acompanhar aprovação");
  });

  it("salvar criticidade não muda classificação e grava updated_by", async () => {
    await pool.query(
      `INSERT INTO commitment_curation (commitment_key, estimated_delivery_date, po_status, source_value_at_curation, curation_level, updated_by, updated_at)
       VALUES ($1, '2026-12-10', 'CONFIRMED', 100, 'RC', 'tester', now())`,
      ["RC:RC27|OC:OC27|PPM:27"]
    );

    const req = criarReq({
      query: { rc: "RC27" },
      body: { criticalityOverride: "CRITICO", targets: [{ commitmentKey: "RC:RC27|OC:OC27|PPM:27", sourceValue: 100 }] },
    });
    const { res, getStatus } = criarRes();

    await handlePutRc(pool, req, res);

    expect(getStatus()).toBe(200);
    const { rows } = await pool.query(
      `SELECT po_status, estimated_delivery_date, criticality_override, criticality_updated_by, criticality_updated_at FROM commitment_curation WHERE commitment_key = $1`,
      ["RC:RC27|OC:OC27|PPM:27"]
    );
    expect(rows[0].po_status).toBe("CONFIRMED");
    expect(rows[0].criticality_override).toBe("CRITICO");
    expect(rows[0].criticality_updated_by).toBe("gestor@g.globo");
    expect(new Date(rows[0].estimated_delivery_date).toISOString().slice(0, 10)).toBe("2026-12-10");
    expect(rows[0].criticality_updated_at).not.toBeNull();
  });

  it("limpar criticidade com null volta para a sugestão do sistema", async () => {
    await pool.query(
      `INSERT INTO commitment_curation (commitment_key, estimated_delivery_date, po_status, source_value_at_curation, curation_level, updated_by, updated_at, criticality_override, criticality_updated_by, criticality_updated_at)
       VALUES ($1, '2026-12-10', 'CONFIRMED', 100, 'RC', 'tester', now(), 'CRITICO', 'tester', now())`,
      ["RC:RC28|OC:OC28|PPM:28"]
    );

    const req = criarReq({
      query: { rc: "RC28" },
      body: { criticalityOverride: null, targets: [{ commitmentKey: "RC:RC28|OC:OC28|PPM:28", sourceValue: 100 }] },
    });
    const { res, getStatus } = criarRes();

    await handlePutRc(pool, req, res);

    expect(getStatus()).toBe(200);
    const { rows } = await pool.query(
      `SELECT criticality_override, criticality_updated_by FROM commitment_curation WHERE commitment_key = $1`,
      ["RC:RC28|OC:OC28|PPM:28"]
    );
    expect(rows[0].criticality_override).toBeNull();
  });

  it("rejeita valor inválido para criticalityOverride com 400", async () => {
    const req = criarReq({
      query: { rc: "RC29" },
      body: { criticalityOverride: "INVALIDO", targets: [{ commitmentKey: "RC:RC29|OC:OC29|PPM:29", sourceValue: 10 }] },
    });
    const { res, getStatus } = criarRes();

    await handlePutRc(pool, req, res);

    expect(getStatus()).toBe(400);
  });

  it("forecastPaymentDate sem exerciseYear retorna 400 em RC", async () => {
    const req = criarReq({
      query: { rc: "RC24" },
      body: { estimatedDeliveryDate: null, poStatus: "NO_VISIBILITY", notes: null, forecastPaymentDate: "2026-12-15", targets: [{ commitmentKey: "RC:RC24|OC:OC24|PPM:24", sourceValue: 10 }] },
    });
    const { res, getStatus, getBody } = criarRes();

    await handlePutRc(pool, req, res);

    expect(getStatus()).toBe(400);
    expect((getBody() as { error: string }).error).toMatch(/exerciseYear/i);
  });

  it("rejeita cashForecast NAO_OCORRE com forecastPaymentDate em RC", async () => {
    const req = criarReq({
      query: { rc: "RC25" },
      body: {
        estimatedDeliveryDate: null,
        poStatus: "NO_VISIBILITY",
        notes: null,
        exerciseYear: 2026,
        cashForecast: "NAO_OCORRE",
        forecastPaymentDate: "2026-12-15",
        targets: [{ commitmentKey: "RC:RC25|OC:OC25|PPM:25", sourceValue: 50 }],
      },
    });
    const { res, getStatus, getBody } = criarRes();

    await handlePutRc(pool, req, res);

    expect(getStatus()).toBe(400);
    expect((getBody() as { error: string }).error).toMatch(/cashForecast/i);
  });

  it("rejeita nonOccurrenceReason sem cashForecast NAO_OCORRE em RC", async () => {
    const req = criarReq({
      query: { rc: "RC26" },
      body: {
        estimatedDeliveryDate: null,
        poStatus: "NO_VISIBILITY",
        notes: null,
        exerciseYear: 2026,
        nonOccurrenceReason: "REDUZIR",
        targets: [{ commitmentKey: "RC:RC26|OC:OC26|PPM:26", sourceValue: 50 }],
      },
    });
    const { res, getStatus, getBody } = criarRes();

    await handlePutRc(pool, req, res);

    expect(getStatus()).toBe(400);
    expect((getBody() as { error: string }).error).toMatch(/nonOccurrenceReason/i);
  });

  it("rejeita sem autenticação", async () => {
    const req = criarReq({
      headers: {},
      query: { rc: "RC3" },
      body: { targets: [{ commitmentKey: "RC:RC3|OC:OC1|PPM:1", sourceValue: 1 }] },
    });
    const { res, getStatus } = criarRes();

    await handlePutRc(pool, req, res);

    expect(getStatus()).toBe(401);
  });

  it("rejeita targets vazio com 400", async () => {
    const req = criarReq({
      query: { rc: "RC4" },
      body: { estimatedDeliveryDate: null, poStatus: "AT_RISK", notes: null, sourceValue: 0, targets: [] },
    });
    const { res, getStatus } = criarRes();

    await handlePutRc(pool, req, res);

    expect(getStatus()).toBe(400);
  });
});
