import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseCsvCarteira } from "../src/lib/csvProcessingCore.ts";

const DATA = resolve("public/data");
const OUTPUT = resolve(DATA, "carteira-processed.json");
const read = (name) => readFileSync(resolve(DATA, name), "utf-8").replace(/^\uFEFF/, "");

async function main() {
  const start = performance.now();
  let current = {};
  try { current = JSON.parse(readFileSync(OUTPUT, "utf-8")); } catch { current = {}; }

  const parsed = parseCsvCarteira({
    orcamentoCsv: read("orcamento.csv"),
    realizadoCsv: read("Realizado.csv"),
    fluxoMensalCsv: read("Fluxo_Mensal.csv"),
    gestores: current.gestores ?? [],
    statusReportValores: current.statusReportValores ?? {},
  });

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(parsed)}\n`, "utf-8");
  console.log(`[preprocessCsv] OK: ${parsed.projetos.length} projetos em ${(performance.now() - start).toFixed(1)}ms`);
}
main().catch((error) => { console.error("[preprocessCsv] Falha", error); process.exit(1); });
