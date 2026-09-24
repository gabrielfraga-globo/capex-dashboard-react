import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Pool } from "pg";
import type { CommitmentCuration, CurationUpsertRequest } from "../../../src/features/radar/types";
import { getPool } from "../../_lib/db";
import { requireAuth } from "../../_lib/auth";
import { responderErro } from "../../_lib/http";
import { validarChave, validarCorpoDeCuradoria, validarSourceValue } from "../../_lib/validation";

export async function handlePutKey(pool: Pool, req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "PUT") {
    res.setHeader("Allow", "PUT");
    res.status(405).json({ error: "Método não suportado" });
    return;
  }

  try {
    const user = requireAuth(req);

    const key = req.query.key;
    validarChave(key);

    const body = (req.body ?? {}) as Partial<CurationUpsertRequest>;
    const { poStatus } = validarCorpoDeCuradoria({
      estimatedDeliveryDate: body.estimatedDeliveryDate,
      poStatus: body.poStatus,
      notes: body.notes,
    });
    const sourceValue = validarSourceValue(body.sourceValue, "sourceValue");

    const estimatedDeliveryDate = body.estimatedDeliveryDate ?? null;
    const notes = body.notes ?? null;

    const client = await pool.connect();
    let inserted = false;
    try {
      await client.query("BEGIN");

      const existing = await client.query(`SELECT 1 FROM commitment_curation WHERE commitment_key = $1`, [key]);
      inserted = existing.rowCount === 0;

      await client.query(
        `INSERT INTO commitment_curation
           (commitment_key, estimated_delivery_date, po_status, notes,
            source_value_at_curation, curation_level, inherited_from_key, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'KEY', NULL, $6, now())
         ON CONFLICT (commitment_key) DO UPDATE SET
           estimated_delivery_date  = EXCLUDED.estimated_delivery_date,
           po_status                = EXCLUDED.po_status,
           notes                    = EXCLUDED.notes,
           source_value_at_curation = EXCLUDED.source_value_at_curation,
           curation_level           = 'KEY',
           inherited_from_key       = NULL,
           updated_by               = EXCLUDED.updated_by,
           updated_at               = EXCLUDED.updated_at`,
        [key, estimatedDeliveryDate, poStatus, notes, sourceValue, user.email]
      );

      await client.query(
        `INSERT INTO curation_audit (commitment_key, action, payload, actor)
         VALUES ($1, 'KEY_UPSERT', $2::jsonb, $3)`,
        [
          key,
          JSON.stringify({
            commitmentKey: key,
            estimatedDeliveryDate,
            poStatus,
            notes,
            sourceValueAtCuration: sourceValue,
            curationLevel: "KEY",
          }),
          user.email,
        ]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const curation: CommitmentCuration = {
      commitmentKey: key,
      estimatedDeliveryDate,
      poStatus,
      notes,
      sourceValueAtCuration: sourceValue,
      curationLevel: "KEY",
      inheritedFromKey: null,
      updatedBy: user.email,
      updatedAt: new Date().toISOString(),
    };
    res.status(inserted ? 201 : 200).json(curation);
  } catch (err) {
    responderErro(res, err);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  return handlePutKey(getPool(), req, res);
}
