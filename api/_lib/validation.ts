import type { PoStatus } from "../../src/features/radar/types";
import { PO_STATUS } from "../../src/features/radar/types";

export class ValidationError extends Error {
  statusCode = 400;
}

const KEY_PATTERN = /^RC:[^|]+\|OC:[^|]+\|PPM:[^|]+$/;

export function validarChave(key: unknown): asserts key is string {
  if (typeof key !== "string" || !KEY_PATTERN.test(key)) {
    throw new ValidationError(`commitmentKey fora do padrão: ${String(key)}`);
  }
}

export function validarPoStatus(poStatus: unknown): PoStatus {
  if (typeof poStatus !== "string" || !(PO_STATUS as readonly string[]).includes(poStatus)) {
    throw new ValidationError(`poStatus inválido: ${String(poStatus)}`);
  }
  return poStatus as PoStatus;
}

interface CorpoDeCuradoria {
  estimatedDeliveryDate: unknown;
  poStatus: unknown;
  notes: unknown;
}

/** Regras comuns aos dois endpoints de escrita, antes de qualquer acesso ao banco. */
export function validarCorpoDeCuradoria(body: CorpoDeCuradoria): { poStatus: PoStatus } {
  const poStatus = validarPoStatus(body.poStatus);

  if (poStatus === "CONFIRMED" && !body.estimatedDeliveryDate) {
    throw new ValidationError("CONFIRMED exige estimatedDeliveryDate");
  }
  if (body.estimatedDeliveryDate != null && typeof body.estimatedDeliveryDate !== "string") {
    throw new ValidationError("estimatedDeliveryDate deve ser uma string no formato AAAA-MM-DD");
  }
  if (body.notes != null && (typeof body.notes !== "string" || body.notes.length > 2000)) {
    throw new ValidationError("notes deve ter no máximo 2000 caracteres");
  }

  return { poStatus };
}

export function validarSourceValue(sourceValue: unknown, label: string): number {
  if (typeof sourceValue !== "number" || !Number.isFinite(sourceValue)) {
    throw new ValidationError(`${label} deve ser um número finito`);
  }
  return sourceValue;
}
