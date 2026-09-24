import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA = resolve("public/data");
const read = (name) => readFileSync(resolve(DATA, name), "utf-8").replace(/^﻿/, "");

const TOLERANCE_MONEY = 1; // R$ 1 de tolerância
const _TOLERANCE_PCT = 0.001; // 0.1% — reserved for future percentage checks

function parseCsvValue(v) {
  if (!v || !v.trim()) return 0;
  const cleaned = v.trim();
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  return Number(normalized) || 0;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const headers = lines[0].split(";").map((h) => h.replace(/"/g, "").trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(";").map((v) => v.replace(/"/g, "").trim());
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
}

let exitCode = 0;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  exitCode = 1;
}

// Load data
const json = JSON.parse(read("carteira-processed.json"));
const projetos = json.projetos;
const realizadoRows = parseCsv(read("Realizado.csv"));
const orcamentoRows = parseCsv(read("orcamento.csv"));

console.log("=== Contagem ===");
console.log(`Projetos no JSON: ${projetos.length}`);
console.log(`Com origemOrcamento: ${projetos.filter((p) => p.origemOrcamento).length}`);
console.log(`Com origemRealizado: ${projetos.filter((p) => p.origemRealizado).length}`);

// Projects without budget but with financial values
const semOrcComValor = projetos.filter(
  (p) =>
    !p.origemOrcamento &&
    ((p.realizado2026 ?? 0) !== 0 ||
      (p.emPagamento2026 ?? 0) !== 0 ||
      (p.compromisso ?? 0) !== 0)
);
console.log(`\nSem orçamento com valores financeiros: ${semOrcComValor.length}`);
for (const p of semOrcComValor.slice(0, 20)) {
  console.log(
    `  ${p.nome}: Real=${p.realizado2026?.toFixed(2)}, Pend=${p.emPagamento2026?.toFixed(2)}, Comp=${p.compromisso?.toFixed(2)}`
  );
}

// JSON totals
const orcamento2026 = projetos.reduce((a, p) => a + (p.orcamento2026 ?? 0), 0);
const realizado2026 = projetos.reduce((a, p) => a + (p.realizado2026 ?? 0), 0);
const emPagamento2026 = projetos.reduce((a, p) => a + (p.emPagamento2026 ?? 0), 0);
const compromisso = projetos.reduce((a, p) => a + (p.compromisso ?? 0), 0);
const aEmitirFonte = projetos.reduce((a, p) => a + (p.aEmitirFonte ?? 0), 0);
const deltaCaixaFonte = projetos.reduce((a, p) => a + (p.deltaCaixaFonte ?? 0), 0);

// Derived a emitir
const executado = realizado2026 + emPagamento2026;
const aEmitirDerivado = orcamento2026 - executado - compromisso;

console.log("\n=== Totais do JSON (período 2026) ===");
console.log(`Orçamento 2026:       ${orcamento2026.toFixed(2)}`);
console.log(`Realizado Pago:       ${realizado2026.toFixed(2)}`);
console.log(`Realizado Pendente:   ${emPagamento2026.toFixed(2)}`);
console.log(`Realizado + Pendente: ${executado.toFixed(2)}`);
console.log(`Compromisso:          ${compromisso.toFixed(2)}`);
console.log(`A Emitir (fonte):     ${aEmitirFonte.toFixed(2)} (soma não-aditiva — informativo)`);
console.log(`A Emitir (derivado):  ${aEmitirDerivado.toFixed(2)}`);
console.log(`Delta Caixa (fonte):  ${deltaCaixaFonte.toFixed(2)} (soma não-aditiva — informativo)`);

// CSV raw totals for comparison
let csvReal2026 = 0, csvPend2026 = 0, csvComp2026 = 0;
for (const r of realizadoRows) {
  if (Number(r.Ano) !== 2026) continue;
  csvReal2026 += parseCsvValue(r.Realizado_Pago);
  csvPend2026 += parseCsvValue(r.Realizado_Pendente);
  csvComp2026 += parseCsvValue(r.Compromisso_Conecta);
}

let csvOrc2026 = 0;
for (const r of orcamentoRows) {
  if (Number(r.Ano) !== 2026) continue;
  csvOrc2026 += parseCsvValue(r.BG_Q3);
}

console.log("\n=== Totais diretos do CSV (2026) ===");
console.log(`Orçamento (BG_Q3):    ${csvOrc2026.toFixed(2)}`);
console.log(`Realizado_Pago:       ${csvReal2026.toFixed(2)}`);
console.log(`Realizado_Pendente:   ${csvPend2026.toFixed(2)}`);
console.log(`Compromisso_Conecta:  ${csvComp2026.toFixed(2)}`);

// Invariant checks
console.log("\n=== Invariantes ===");

// 1. NaN / Infinity
for (const p of projetos) {
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === "number" && (!Number.isFinite(v))) {
      fail(`Projeto "${p.nome}" campo "${k}" = ${v}`);
    }
    if (Array.isArray(v)) {
      v.forEach((el, i) => {
        if (typeof el === "number" && !Number.isFinite(el)) {
          fail(`Projeto "${p.nome}" campo "${k}[${i}]" = ${el}`);
        }
      });
    }
  }
}

// 2. meses2026 sum vs orcamento2026
for (const p of projetos) {
  if (p.meses2026) {
    const sumMeses = p.meses2026.reduce((a, b) => a + b, 0);
    if (Math.abs(sumMeses - (p.orcamento2026 ?? 0)) > TOLERANCE_MONEY) {
      fail(`Projeto "${p.nome}": soma meses2026 (${sumMeses.toFixed(2)}) != orcamento2026 (${p.orcamento2026})`);
    }
  }
}

// 3. No fallback from Orcamento_Cenarios
const semBGQ3ComOrc = projetos.filter((p) => !p.origemOrcamento && (p.orcamento2026 ?? 0) !== 0);
if (semBGQ3ComOrc.length > 0) {
  for (const p of semBGQ3ComOrc) {
    fail(`Projeto "${p.nome}" sem BG_Q3 mas com orcamento2026=${p.orcamento2026} — fallback indevido`);
  }
}

// 4. JSON totals vs CSV totals
if (Math.abs(orcamento2026 - csvOrc2026) > TOLERANCE_MONEY) {
  fail(`Orçamento JSON (${orcamento2026.toFixed(2)}) != CSV (${csvOrc2026.toFixed(2)})`);
}
if (Math.abs(realizado2026 - csvReal2026) > TOLERANCE_MONEY) {
  fail(`Realizado JSON (${realizado2026.toFixed(2)}) != CSV (${csvReal2026.toFixed(2)})`);
}
if (Math.abs(emPagamento2026 - csvPend2026) > TOLERANCE_MONEY) {
  fail(`EmPagamento JSON (${emPagamento2026.toFixed(2)}) != CSV (${csvPend2026.toFixed(2)})`);
}

// 5. Duplicates in expected grain (N4 + NomeLB + Ano) in Realizado.csv
const realizadoKeys = new Set();
for (const r of realizadoRows) {
  const key = `${r.N4}|${r.NomeLB}|${r.Ano}`;
  if (realizadoKeys.has(key)) {
    fail(`Duplicata em Realizado.csv: ${key}`);
  }
  realizadoKeys.add(key);
}

// 6. Compromisso exceeding budget
const compExcede = projetos
  .filter((p) => (p.compromisso ?? 0) > (p.orcamento2026 ?? 0) && (p.orcamento2026 ?? 0) > 0)
  .sort((a, b) => ((b.compromisso ?? 0) - (b.orcamento2026 ?? 0)) - ((a.compromisso ?? 0) - (a.orcamento2026 ?? 0)));

console.log(`\nTop 20 compromisso > orçamento:`);
for (const p of compExcede.slice(0, 20)) {
  console.log(
    `  ${p.nome}: Comp=${(p.compromisso ?? 0).toFixed(2)}, Orc=${(p.orcamento2026 ?? 0).toFixed(2)}, Diff=${((p.compromisso ?? 0) - (p.orcamento2026 ?? 0)).toFixed(2)}`
  );
}

// Power BI reference comparison
console.log("\n=== Comparação com Power BI (referência 24/09/2026) ===");
const pbi = {
  orcamento: 145_540_000,
  realizadoPago: 72_420_000,
  realizadoPendente: 8_200_000,
  compromisso: 53_170_000,
  aEmitir: 11_750_000,
};
console.log(`Métrica              | Portal          | Power BI        | Δ`);
console.log(`Orçamento 2026       | ${(orcamento2026/1e6).toFixed(2)}M  | ${(pbi.orcamento/1e6).toFixed(2)}M  | ${((orcamento2026-pbi.orcamento)/1e6).toFixed(2)}M`);
console.log(`Realizado Pago       | ${(realizado2026/1e6).toFixed(2)}M  | ${(pbi.realizadoPago/1e6).toFixed(2)}M  | ${((realizado2026-pbi.realizadoPago)/1e6).toFixed(2)}M`);
console.log(`Realizado Pendente   | ${(emPagamento2026/1e6).toFixed(2)}M  | ${(pbi.realizadoPendente/1e6).toFixed(2)}M  | ${((emPagamento2026-pbi.realizadoPendente)/1e6).toFixed(2)}M`);
console.log(`Compromisso          | ${(compromisso/1e6).toFixed(2)}M  | ${(pbi.compromisso/1e6).toFixed(2)}M  | ${((compromisso-pbi.compromisso)/1e6).toFixed(2)}M`);
console.log(`A Emitir (derivado)  | ${(aEmitirDerivado/1e6).toFixed(2)}M  | ${(pbi.aEmitir/1e6).toFixed(2)}M  | ${((aEmitirDerivado-pbi.aEmitir)/1e6).toFixed(2)}M`);

if (exitCode === 0) {
  console.log("\nTodas as invariantes passaram.");
} else {
  console.error("\nInvariantes violadas — ver mensagens acima.");
}

process.exit(exitCode);
