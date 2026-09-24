import type { VercelRequest } from "@vercel/node";

export interface CurrentUser {
  email: string;
}

export class AuthError extends Error {
  statusCode = 401;
}

/**
 * TODO(auth): stub temporário — lê a identidade de um header injetado pelo cliente.
 * Este é o ÚNICO ponto de leitura de identidade da API; nenhum handler deve ler
 * o usuário de outro lugar (nunca do corpo da requisição). Troque a implementação
 * por SSO/Entra real antes de produção, mantendo a assinatura de `getCurrentUser`.
 */
export function getCurrentUser(req: VercelRequest): CurrentUser | null {
  const header = req.headers["x-user-email"];
  const email = Array.isArray(header) ? header[0] : header;
  if (!email || email.trim() === "") return null;
  return { email: email.trim() };
}

export function requireAuth(req: VercelRequest): CurrentUser {
  const user = getCurrentUser(req);
  if (!user) throw new AuthError("Não autenticado");
  return user;
}
