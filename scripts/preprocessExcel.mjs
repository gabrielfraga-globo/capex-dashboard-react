import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { parseWorkbookBuffer } from "../src/lib/excelProcessingCore.ts";

const INPUT_PATH = resolve("public/data/carteira.xlsx");
const OUTPUT_PATH = resolve("public/data/carteira-processed.json");

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

async function main() {
  const start = performance.now();

  const rawFile = readFileSync(INPUT_PATH);
  const parsed = await parseWorkbookBuffer(toArrayBuffer(rawFile), basename(INPUT_PATH));

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(parsed)}\n`, "utf-8");

  const elapsedMs = performance.now() - start;
  console.log(
    `[preprocessExcel] OK: ${OUTPUT_PATH} gerado com ${parsed.projetos.length} projetos em ${elapsedMs.toFixed(1)}ms`
  );
}

main().catch((error) => {
  console.error("[preprocessExcel] Falha ao pré-processar carteira.xlsx", error);
  process.exit(1);
});
