import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Pool } from "pg";
import type { CurationMap } from "../../src/features/radar/types.js";
import { getPool } from "../_lib/db.js";
import { requireAuth } from "../_lib/auth.js";
import { responderErro } from "../_lib/http.js";
import { rowToCuration } from "../_lib/curationColumns.js";

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
            updated_by, updated_at,
            cash_forecast, suggested_payment_date, forecast_payment_date,
            payment_date_adjusted, payment_exception_reason, confidence,
            non_occurrence_reason, blocker, next_action, next_action_updated_at,
            physical_arrival, payment_mode, priority, decision_stage,
            decision_updated_at
       FROM commitment_curation`
  );

  const data: CurationMap = {};
  for (const row of rows) {
    data[row.commitment_key] = rowToCuration(row);
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
