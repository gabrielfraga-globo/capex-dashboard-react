import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getPool } from "../api/_lib/db.js";

interface RadarBundle {
  commitments: Array<{ commitmentKey: string }>;
}

interface CurationRow {
  commitment_key: string;
  estimated_delivery_date: string | Date | null;
  po_status: string;
  notes: string | null;
  source_value_at_curation: string | number | null;
  curation_level: string;
  inherited_from_key: string | null;
  updated_by: string;
  updated_at: string | Date;
}

function formatValue(value: unknown): string {
  if (value == null) return "—";
  return value instanceof Date ? value.toISOString() : String(value);
}

function parseCommitmentKey(commitmentKey: string): { rc: string; oc: string; ppm: string } {
  const fields = Object.fromEntries(
    commitmentKey.split("|").map((part) => {
      const separator = part.indexOf(":");
      return separator === -1 ? [part, ""] : [part.slice(0, separator), part.slice(separator + 1)];
    })
  );
  return { rc: fields.RC ?? "", oc: fields.OC ?? "", ppm: fields.PPM ?? "" };
}

async function main(): Promise<void> {
  const bundlePath = fileURLToPath(new URL("../public/data/radar-bundle.json", import.meta.url));
  const bundle = JSON.parse(readFileSync(bundlePath, "utf-8")) as RadarBundle;
  const validKeys = new Set(bundle.commitments.map((commitment) => commitment.commitmentKey));
  const pool = getPool();

  try {
    const { rows } = await pool.query<CurationRow>(
      `SELECT commitment_key, estimated_delivery_date, po_status, notes,
              source_value_at_curation, curation_level, inherited_from_key,
              updated_by, updated_at
         FROM commitment_curation
        ORDER BY updated_at DESC, commitment_key`
    );
    const orphans = rows.filter((row) => !validKeys.has(row.commitment_key));
    const total = orphans.reduce((sum, row) => sum + Number(row.source_value_at_curation ?? 0), 0);

    console.log(`Bundle: ${validKeys.size} commitment_key válidas`);
    console.log(`Curadorias consultadas: ${rows.length}`);
    console.log(`Curadorias órfãs: ${orphans.length}`);
    console.log(`Total curado órfão: R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

    for (const row of orphans) {
      const { rc, oc, ppm } = parseCommitmentKey(row.commitment_key);
      console.log(JSON.stringify({
        commitment_key: row.commitment_key,
        rc,
        oc,
        ppm,
        updated_by: row.updated_by,
        updated_at: formatValue(row.updated_at),
        estimated_delivery_date: formatValue(row.estimated_delivery_date),
        po_status: row.po_status,
        notes: row.notes,
        source_value_at_curation: row.source_value_at_curation,
        curation_level: row.curation_level,
        inherited_from_key: row.inherited_from_key,
      }));
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Falha ao verificar curadorias órfãs:", error);
  process.exitCode = 1;
});
