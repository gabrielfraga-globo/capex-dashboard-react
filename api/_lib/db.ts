import { Pool, types } from "pg";

// coluna `date` volta como string "AAAA-MM-DD" crua, sem conversão de fuso horário (OID 1082)
types.setTypeParser(1082, (value) => value);

let pool: Pool | undefined;

/** Pool singleton reaproveitado entre invocações da mesma instância de function. */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL não configurada");
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}
