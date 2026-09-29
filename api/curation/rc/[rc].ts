import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Pool } from "pg";
import type { RcCurationUpsertRequest, RcCurationUpsertResponse } from "../../../src/features/radar/types.js";
import { getPool } from "../../_lib/db.js";
import { requireAuth } from "../../_lib/auth.js";
import { responderErro } from "../../_lib/http.js";
import { buildCurationWrite, CURATION_WRITE_COLUMN_WHITELIST } from "../../_lib/curationColumns.js";
import { ValidationError, validarChave, validarCorpoDeCuradoria, validarSourceValue } from "../../_lib/validation.js";

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
      criticalityOverride: body.criticalityOverride,
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

    const client = await pool.connect();
    let written: string[] = [];
    try {
      await client.query("BEGIN");

      for (const target of targets) {
        const existing = await client.query(
          `SELECT * FROM commitment_curation WHERE commitment_key = $1`,
          [target.commitmentKey]
        );

        const writeBody = {
          ...body,
          sourceValue: target.sourceValue,
          ...(body.estimatedDeliveryDate !== undefined ? { estimatedDeliveryDate: body.estimatedDeliveryDate ?? null } : {}),
          ...(poStatus != null ? { poStatus } : body.poStatus != null ? { poStatus: body.poStatus } : {}),
          ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
        };

        const write = buildCurationWrite(writeBody, exerciseYear ?? 0, user.email);

        const payload: Record<string, unknown> = {
          ...write.columns,
          source_value_at_curation: target.sourceValue,
        };
        if (write.mode === "OPERACIONAL" && !Object.prototype.hasOwnProperty.call(payload, "po_status")) {
          payload.po_status = existing.rows[0]?.po_status ?? "NO_VISIBILITY";
          payload.estimated_delivery_date = existing.rows[0]?.estimated_delivery_date ?? null;
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
          target.commitmentKey,
          target.sourceValue,
          ...updateColumns.map((column) => payload[column]),
          "RC",
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
             curation_level = 'RC',
             inherited_from_key = NULL,
             updated_by = EXCLUDED.updated_by,
             updated_at = EXCLUDED.updated_at
           WHERE $${insertColumns.length + 1} OR commitment_curation.curation_level = 'RC'
           RETURNING commitment_key, updated_by`,
          [...insertValues, overrideKeyLevel]
        );

        if (existing.rows[0] == null || overrideKeyLevel || existing.rows[0].curation_level !== "KEY") {
          written.push(target.commitmentKey);
          await client.query(
            `INSERT INTO curation_audit (commitment_key, action, payload, actor)
             VALUES ($1, 'RC_UPSERT', $2::jsonb, $3)`,
            [
              target.commitmentKey,
              JSON.stringify({
                commitmentKey: target.commitmentKey,
                ...body,
                exerciseYear,
                sourceValueAtCuration: target.sourceValue,
                curationLevel: "RC",
                derived: write,
              }),
              user.email,
            ]
          );
        }
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
  try {
    return handlePutRc(getPool(), req, res);
  } catch (err) {
    responderErro(res, err);
  }
}
