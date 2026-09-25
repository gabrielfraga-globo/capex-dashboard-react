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
