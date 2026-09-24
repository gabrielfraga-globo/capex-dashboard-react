import type { VercelResponse } from "@vercel/node";

/** Mapeia erros conhecidos (auth/validação) para o status HTTP correto. */
export function responderErro(res: VercelResponse, err: unknown): void {
  const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
  const message = err instanceof Error ? err.message : "Erro inesperado";
  if (statusCode === 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  res.status(statusCode).json({ error: message });
}
