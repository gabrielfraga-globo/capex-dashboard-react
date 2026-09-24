import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Pool } from "pg";
import type { RcCurationUpsertRequest, RcCurationUpsertResponse } from "../../../src/features/radar/types";
import { getPool } from "../../_lib/db";
import { requireAuth } from "../../_lib/auth";
import { responderErro } from "../../_lib/http";
import { ValidationError, validarChave, validarCorpoDeCuradoria, validarSourceValue } from "../../_lib/validation";

export async function handlePutRc(pool: Pool, req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "PUT") {
    res.setHeader("Allow", "PUT");
    res.status(405).json({ error: "Método não suportado" });
    return;
  }

  try {
    const user = requireAuth(req);

    const rc = req.query.rc;
    if (typeof rc !== "string" || rc.trim() === "") {
      throw new ValidationError("rc é obrigatório na URL");
    }

    const body = (req.body ?? {}) as Partial<RcCurationUpsertRequest>;
    const { poStatus } = validarCorpoDeCuradoria({
      estimatedDeliveryDate: body.estimatedDeliveryDate,
      poStatus: body.poStatus,
      notes: body.notes,
    });

    const targets = body.targets;
    if (!Array.isArray(targets) || targets.length === 0) {
      throw new ValidationError("targets não pode ser vazio");
    }

    const prefixoRc = `RC:${rc}|`;
    for (const target of targets) {
      validarChave(target?.commitmentKey);
      if (!target.commitmentKey.startsWith(prefixoRc)) {
        throw new ValidationError(`commitmentKey ${target.commitmentKey} não pertence à RC ${rc}`);
      }
      validarSourceValue(target.sourceValue, `sourceValue de ${target.commitmentKey}`);
    }

    const overrideKeyLevel = body.overrideKeyLevel === true;
    const estimatedDeliveryDate = body.estimatedDeliveryDate ?? null;
    const notes = body.notes ?? null;

    // params compartilhados por todas as linhas do lote
    const params: unknown[] = [estimatedDeliveryDate, poStatus, notes, user.email, overrideKeyLevel];
    const valueRows: string[] = [];

    for (const target of targets) {
      const keyIdx = params.length + 1;
      params.push(target.commitmentKey);
      const valIdx = params.length + 1;
      params.push(target.sourceValue);
      valueRows.push(`($${keyIdx}, $1, $2, $3, $${valIdx}, 'RC', NULL, $4, now())`);
    }

    const client = await pool.connect();
    let written: string[] = [];
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `INSERT INTO commitment_curation
           (commitment_key, estimated_delivery_date, po_status, notes,
            source_value_at_curation, curation_level, inherited_from_key, updated_by, updated_at)
         VALUES
           ${valueRows.join(",\n           ")}
         ON CONFLICT (commitment_key) DO UPDATE SET
           estimated_delivery_date  = EXCLUDED.estimated_delivery_date,
           po_status                = EXCLUDED.po_status,
           notes                    = EXCLUDED.notes,
           source_value_at_curation = EXCLUDED.source_value_at_curation,
           curation_level           = 'RC',
           inherited_from_key       = NULL,
           updated_by               = EXCLUDED.updated_by,
           updated_at               = EXCLUDED.updated_at
         WHERE $5 OR commitment_curation.curation_level = 'RC'
         RETURNING commitment_key, updated_by`,
        params
      );
      // Filtra por updated_by = ator atual: em Postgres real o RETURNING já
      // exclui linhas cujo WHERE deu falso, mas alguns bancos in-memory usados
      // em teste (pg-mem) incluem a linha no RETURNING mesmo sem aplicar o
      // UPDATE. Este filtro é redundante (no-op) em Postgres real e garante
      // que `written` reflita apenas linhas cuja escrita de fato ocorreu.
      written = rows.filter((r) => r.updated_by === user.email).map((r) => r.commitment_key as string);

      for (const key of written) {
        const target = targets.find((t) => t.commitmentKey === key)!;
        await client.query(
          `INSERT INTO curation_audit (commitment_key, action, payload, actor)
           VALUES ($1, 'RC_UPSERT', $2::jsonb, $3)`,
          [
            key,
            JSON.stringify({
              commitmentKey: key,
              estimatedDeliveryDate,
              poStatus,
              notes,
              sourceValueAtCuration: target.sourceValue,
              curationLevel: "RC",
            }),
            user.email,
          ]
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const preserved = targets.map((t) => t.commitmentKey).filter((key) => !written.includes(key));

    const response: RcCurationUpsertResponse = { rc, written, preserved };
    res.status(200).json(response);
  } catch (err) {
    responderErro(res, err);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  return handlePutRc(getPool(), req, res);
}
