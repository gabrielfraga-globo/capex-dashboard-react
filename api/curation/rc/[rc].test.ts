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
