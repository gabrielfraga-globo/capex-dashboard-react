import type { VercelRequest, VercelResponse } from "@vercel/node";

interface ReqOverrides {
  method?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
}

/** Fakes mínimos de VercelRequest/VercelResponse para testes de integração dos handlers. */
export function criarReq(overrides: ReqOverrides = {}): VercelRequest {
  return {
    method: overrides.method ?? "PUT",
    headers: overrides.headers ?? { "x-user-email": "gestor@g.globo" },
    query: overrides.query ?? {},
    body: overrides.body ?? {},
  } as unknown as VercelRequest;
}

export function criarRes() {
  let statusCode = 200;
  let jsonBody: unknown;
  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(body: unknown) {
      jsonBody = body;
      return res;
    },
    setHeader() {
      return res;
    },
  } as unknown as VercelResponse;

  return {
    res,
    getStatus: () => statusCode,
    getBody: () => jsonBody,
  };
}
