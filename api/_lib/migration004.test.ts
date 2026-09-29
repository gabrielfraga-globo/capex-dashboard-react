import { describe, expect, it } from "vitest";
import { criarPoolDeTeste } from "./testDb";

describe("004_criticidade_manual migration constraints", () => {
  it("aplica a constraint de criticality_override", async () => {
    const pool = criarPoolDeTeste();

    // insert invalid value
    await expect(pool.query(`
      INSERT INTO commitment_curation (
        commitment_key, estimated_delivery_date, po_status, notes, source_value_at_curation,
        curation_level, inherited_from_key, updated_by, updated_at,
        criticality_override, criticality_updated_by, criticality_updated_at
      ) VALUES (
        'RC:RC7|OC:OC7|PPM:7', '2026-11-20', 'CONFIRMED', null, 1000,
        'RC', null, 'tester', '2026-09-26T00:00:00.000Z',
        'INVALIDO', 'tester', '2026-09-26T00:00:00.000Z'
      )
    `)).rejects.toThrow();

    // insert valid value
    await expect(pool.query(`
      INSERT INTO commitment_curation (
        commitment_key, estimated_delivery_date, po_status, notes, source_value_at_curation,
        curation_level, inherited_from_key, updated_by, updated_at,
        criticality_override, criticality_updated_by, criticality_updated_at
      ) VALUES (
        'RC:RC8|OC:OC8|PPM:8', '2026-11-20', 'CONFIRMED', null, 1000,
        'RC', null, 'tester', '2026-09-26T00:00:00.000Z',
        'CRITICO', 'tester', '2026-09-26T00:00:00.000Z'
      )
    `)).resolves.toBeDefined();
  });
});
