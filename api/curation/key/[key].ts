import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Pool } from "pg";
import type { CommitmentCuration, CurationUpsertRequest } from "../../../src/features/radar/types.js";
import { getPool } from "../../_lib/db.js";
import { requireAuth } from "../../_lib/auth.js";
import { responderErro } from "../../_lib/http.js";
import { buildCurationWrite, CURATION_WRITE_COLUMN_WHITELIST, rowToCuration } from "../../_lib/curationColumns.js";
import { validarChave, validarCorpoDeCuradoria, validarSourceValue } from "../../_lib/validation.js";

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
    const { poStatus, exerciseYear } = validarCorpoDeCuradoria({
      estimatedDeliveryDate: body.estimatedDeliveryDate,
      poStatus: body.poStatus,
      notes: body.notes,
      exerciseYear: body.exerciseYear,
      forecastPaymentDate: body.forecastPaymentDate,
      suggestedPaymentDate: body.suggestedPaymentDate,
      paymentExceptionReason: body.paymentExceptionReason,
      cashForecast: body.cashForecast,
      nonOccurrenceReason: body.nonOccurrenceReason,
      confidence: body.confidence,
      blocker: body.blocker,
      nextAction: body.nextAction,
      physicalArrival: body.physicalArrival,
      paymentMode: body.paymentMode,
      priority: body.priority,
      decisionStage: body.decisionStage,
    });
    const sourceValue = validarSourceValue(body.sourceValue, "sourceValue");

    const client = await pool.connect();
    let inserted = false;
    let write: ReturnType<typeof buildCurationWrite>;
    try {
      await client.query("BEGIN");

      const existing = await client.query(
        `SELECT * FROM commitment_curation WHERE commitment_key = $1`,
        [key]
      );
      inserted = existing.rowCount === 0;

      const writeBody = {
        ...body,
        ...(body.estimatedDeliveryDate !== undefined ? { estimatedDeliveryDate: body.estimatedDeliveryDate ?? null } : {}),
        ...(poStatus != null ? { poStatus } : body.poStatus != null ? { poStatus: body.poStatus } : {}),
        ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
        sourceValue,
      };

      write = buildCurationWrite(writeBody, exerciseYear ?? 0);

      const payload = {
        ...write.columns,
        source_value_at_curation: sourceValue,
      };
      if (write.mode === "OPERACIONAL" && !Object.prototype.hasOwnProperty.call(payload, "po_status")) {
        payload.po_status = existing.rows[0]?.po_status ?? "NO_VISIBILITY";
      }

      const updateColumns = CURATION_WRITE_COLUMN_WHITELIST.filter(
        (column) => column !== "source_value_at_curation" && Object.prototype.hasOwnProperty.call(payload, column)
      );
      const updateSql = [
        "source_value_at_curation = EXCLUDED.source_value_at_curation",
        ...updateColumns.map((column) => `${column} = EXCLUDED.${column}`),
      ].join(", ");
      const insertColumns = ["commitment_key", "source_value_at_curation", ...updateColumns, "curation_level", "inherited_from_key", "updated_by", "updated_at"]
        .filter((column, index, arr) => arr.indexOf(column) === index);
      const updatedAt = new Date().toISOString();
      const insertValues = [
        key,
        sourceValue,
        ...updateColumns.map((column) => payload[column]),
        "KEY",
        null,
        user.email,
        updatedAt,
      ];

      await client.query(
        `INSERT INTO commitment_curation
           (${insertColumns.join(", ")})
         VALUES (${insertColumns.map((_, index) => `$${index + 1}`).join(", ")})
         ON CONFLICT (commitment_key) DO UPDATE SET
           ${updateSql},
           curation_level = 'KEY',
           inherited_from_key = NULL,
           updated_by = EXCLUDED.updated_by,
           updated_at = EXCLUDED.updated_at`,
        insertValues
      );

      await client.query(
        `INSERT INTO curation_audit (commitment_key, action, payload, actor)
         VALUES ($1, 'KEY_UPSERT', $2::jsonb, $3)`,
        [
          key,
          JSON.stringify({
            commitmentKey: key,
            ...body,
            exerciseYear,
            sourceValueAtCuration: sourceValue,
            curationLevel: "KEY",
            derived: write,
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

    const responsePayload = { ...write.columns, source_value_at_curation: sourceValue };
    const curation: CommitmentCuration = rowToCuration({
      commitment_key: key,
      estimated_delivery_date: responsePayload.estimated_delivery_date,
      po_status: responsePayload.po_status,
      notes: responsePayload.notes,
      source_value_at_curation: responsePayload.source_value_at_curation,
      curation_level: "KEY",
      inherited_from_key: null,
      updated_by: user.email,
      updated_at: new Date().toISOString(),
      cash_forecast: responsePayload.cash_forecast,
      suggested_payment_date: responsePayload.suggested_payment_date,
      forecast_payment_date: responsePayload.forecast_payment_date,
      payment_date_adjusted: responsePayload.payment_date_adjusted,
      payment_exception_reason: responsePayload.payment_exception_reason,
      confidence: responsePayload.confidence,
      non_occurrence_reason: responsePayload.non_occurrence_reason,
      blocker: responsePayload.blocker,
      next_action: responsePayload.next_action,
      next_action_updated_at: responsePayload.next_action_updated_at,
      physical_arrival: responsePayload.physical_arrival,
      payment_mode: responsePayload.payment_mode,
      priority: responsePayload.priority,
      decision_stage: responsePayload.decision_stage,
      decision_updated_at: responsePayload.decision_updated_at,
    });
    res.status(inserted ? 201 : 200).json(curation);
  } catch (err) {
    responderErro(res, err);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    return handlePutKey(getPool(), req, res);
  } catch (err) {
    responderErro(res, err);
  }
}
