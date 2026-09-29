import { afterEach, describe, expect, it } from "vitest";
import { criarReq, criarRes } from "../_lib/testHttp";
import handler from "./index";

describe("GET /api/curation", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("retorna 503 quando DATABASE_URL não está configurada", async () => {
    delete process.env.DATABASE_URL;

    const req = criarReq({
      method: "GET",
      headers: { "x-user-email": "gestor@g.globo" },
      query: {},
    });
    const { res, getStatus, getBody } = criarRes();

    await handler(req, res);

    expect(getStatus()).toBe(503);
    expect((getBody() as { error: string }).error).toMatch(/DATABASE_URL/i);
  });
});

describe("GET /api/curation — criticidade manual (Fase 7d)", () => {
  it("devolve a criticidade gravada pelo PUT de RC (ida e volta)", async () => {
    const { criarPoolDeTeste } = await import("../_lib/testDb");
    const { handlePutRc } = await import("./rc/[rc]");
    const { handleGetCuration } = await import("./index");
    const pool = criarPoolDeTeste();
    const chave = "RC:RC40|OC:OC40|PPM:40";

    const put = criarRes();
    await handlePutRc(
      pool,
      criarReq({ query: { rc: "RC40" }, body: { criticalityOverride: "CRITICO", targets: [{ commitmentKey: chave, sourceValue: 100 }] } }),
      put.res
    );
    expect(put.getStatus()).toBe(200);

    const get = criarRes();
    await handleGetCuration(pool, criarReq({ method: "GET" }), get.res);
    const cur = (get.getBody() as { data: Record<string, { criticalityOverride?: string | null; criticalityUpdatedBy?: string | null; criticalityUpdatedAt?: string | null }> }).data[chave];
    expect(cur.criticalityOverride).toBe("CRITICO");
    expect(cur.criticalityUpdatedBy).toBe("gestor@g.globo");
    expect(cur.criticalityUpdatedAt).not.toBeNull();
  });
});
