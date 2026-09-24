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
});
