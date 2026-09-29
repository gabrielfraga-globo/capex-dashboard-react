import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { newDb, DataType } from "pg-mem";
import type { Pool } from "pg";

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../db/migrations"
);

/**
 * Sobe um Postgres em memória (pg-mem) a partir do SQL real da migration, para
 * testes de integração sem depender de um Postgres externo.
 *
 * pg-mem não implementa o operador de regex `~` nem `length`/`split_part`
 * nativamente. As duas funções são registradas manualmente; a CHECK
 * `chave_formato` (a única que depende de `~`) é removida SÓ nesta cópia em
 * memória — a migration real em db/migrations/001_radar_curation.sql
 * permanece inalterada. O formato da chave já é validado em código antes de
 * qualquer escrita (api/_lib/validation.ts), então a cobertura não fica sem teste.
 */
export function criarPoolDeTeste(): Pool {
  const db = newDb();

  db.public.registerFunction({
    name: "length",
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (s: string | null) => (s == null ? null : s.length),
  });
  db.public.registerFunction({
    name: "split_part",
    args: [DataType.text, DataType.text, DataType.integer],
    returns: DataType.text,
    implementation: (s: string | null, sep: string, n: number) => (s == null ? null : s.split(sep)[n - 1] ?? ""),
  });

  const migrationSql = ["001_radar_curation.sql", "002_derived_po_status.sql", "003_decisao_gestor.sql", "004_criticidade_manual.sql"]
    .map((fileName) => readFileSync(path.join(MIGRATIONS_DIR, fileName), "utf8"))
    .join("\n")
    .replace(
    /,\s*CONSTRAINT chave_formato\s*\n\s*CHECK \(commitment_key ~ '[^']*'\)/,
    ""
    );

  db.public.none(migrationSql);

  const { Pool: MemPool } = db.adapters.createPg();
  return new MemPool() as unknown as Pool;
}
