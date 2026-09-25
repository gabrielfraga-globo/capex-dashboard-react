import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Pool } from "pg";
import type { CommitmentCuration, CurationMap } from "../../src/features/radar/types.js";
import { getPool } from "../_lib/db.js";
import { requireAuth } from "../_lib/auth.js";
import { responderErro } from "../_lib/http.js";

/** Datas voltam cruas (string) do driver real; em pg-mem podem vir como Date. */
function paraDataIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function paraTimestampIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function handleGetCuration(pool: Pool, req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Método não suportado" });
    return;
  }

  try {
    requireAuth(req);
  } catch (err) {
    responderErro(res, err);
    return;
  }

  const { rows } = await pool.query(
    `SELECT commitment_key, estimated_delivery_date, po_status, notes,
            source_value_at_curation, curation_level, inherited_from_key,
            updated_by, updated_at
       FROM commitment_curation`
  );

  const data: CurationMap = {};
  for (const row of rows) {
    const curation: CommitmentCuration = {
      commitmentKey: row.commitment_key,
      estimatedDeliveryDate: paraDataIso(row.estimated_delivery_date),
      poStatus: row.po_status,
      notes: row.notes,
      sourceValueAtCuration:
        row.source_value_at_curation != null ? Number(row.source_value_at_curation) : null,
      curationLevel: row.curation_level,
      inheritedFromKey: row.inherited_from_key,
      updatedBy: row.updated_by,
      updatedAt: paraTimestampIso(row.updated_at),
    };
    data[row.commitment_key] = curation;
  }

  res.status(200).json({
    data,
    meta: { count: rows.length, generatedAt: new Date().toISOString() },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    return handleGetCuration(getPool(), req, res);
  } catch (err) {
    responderErro(res, err);
  }
}
