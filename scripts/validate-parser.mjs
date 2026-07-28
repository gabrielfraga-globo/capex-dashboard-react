import * as XLSX from "xlsx";
import fs from "fs";

const buf = fs.readFileSync("/mnt/user-data/uploads/relatório.xlsx");
const wb = XLSX.read(buf, { type: "buffer" });

function toNumberOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  return null;
}

// ---- Orçamento ----
function parseOrcamento(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const out = [];
  let currentN4 = null;
  for (let i = 3; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c === null)) continue;
    const n4Cell = row[0];
    const nomeLB = row[1];
    if (n4Cell) currentN4 = n4Cell;
    if (!nomeLB || nomeLB === "Total") continue;
    if (!currentN4) continue;
    const meses2026 = [];
    for (let c = 2; c <= 13; c++) meses2026.push(toNumberOrNull(row[c]) ?? 0);
    const total2026 = toNumberOrNull(row[14]) ?? meses2026.reduce((a,b)=>a+b,0);
    const meses2027 = [];
    for (let c = 15; c <= 17; c++) meses2027.push(toNumberOrNull(row[c]) ?? 0);
    const total2027 = toNumberOrNull(row[18]) ?? meses2027.reduce((a,b)=>a+b,0);
    const totalGeral = toNumberOrNull(row[19]) ?? total2026+total2027;
    out.push({ n4: currentN4, nomeLB, meses2026, total2026, meses2027, total2027, totalGeral });
  }
  return out;
}

// ---- Realizado ----
function parseRealizado(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const out = [];
  let curAno = null, curN4 = null, curAprovador = null;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c === null)) continue;
    const anoCell = row[0];
    const n4Cell = row[1];
    const aprovCell = row[2];
    const nomeCell = row[3];
    if (anoCell !== null && anoCell !== undefined) {
      if (anoCell === "Total") { curAno = null; continue; }
      curAno = String(anoCell);
      curN4 = null; curAprovador = null;
    }
    if (!curAno) continue;
    if (n4Cell) { curN4 = n4Cell; curAprovador = null; }
    if (aprovCell) curAprovador = aprovCell;
    if (!nomeCell || nomeCell === "Total") continue;
    if (!curN4) continue;
    const orcamento = toNumberOrNull(row[4]) ?? 0;
    const realizado = toNumberOrNull(row[5]) ?? 0;
    const emPagamento = toNumberOrNull(row[6]) ?? 0;
    const deltaCaixa = toNumberOrNull(row[7]) ?? orcamento-realizado-emPagamento;
    const compromisso = toNumberOrNull(row[8]) ?? 0;
    const aEmitir = toNumberOrNull(row[9]) ?? deltaCaixa-compromisso;
    out.push({ ano: curAno, n4: curN4, aprovador: curAprovador, nomeLB: nomeCell, orcamento, realizado, emPagamento, deltaCaixa, compromisso, aEmitir });
  }
  return out;
}

const orcamento = parseOrcamento(wb.Sheets["Orçamento"]);
const realizado = parseRealizado(wb.Sheets["Realizado"]);

console.log("Orçamento: projetos únicos =", new Set(orcamento.map(o=>o.n4+"|"+o.nomeLB)).size);
console.log("Orçamento: soma TotalGeral =", orcamento.reduce((a,o)=>a+o.totalGeral,0).toFixed(2));

console.log("Realizado: linhas =", realizado.length);
console.log("Realizado: projetos únicos =", new Set(realizado.map(r=>r.n4+"|"+r.nomeLB)).size);

// dedup compromisso por projeto + soma aditiva do resto, agrupado por período 2026
const map = new Map();
for (const r of realizado) {
  const key = r.n4+"|"+r.nomeLB;
  let a = map.get(key);
  if (!a) { a = { orc2026:0, real2026:0, emp2026:0, compromissos: [] }; map.set(key,a); }
  if (r.ano === "2026") { a.orc2026 += r.orcamento; a.real2026 += r.realizado; a.emp2026 += r.emPagamento; }
  a.compromissos.push(r.compromisso);
}
let orc2026=0, real2026=0, emp2026=0, compromissoTotal=0;
for (const [,a] of map) {
  orc2026 += a.orc2026; real2026 += a.real2026; emp2026 += a.emp2026;
  compromissoTotal += Math.max(...a.compromissos, 0);
}
console.log("\n--- 2026 (via Realizado, dedup Compromisso) ---");
console.log("Orçamento 2026:", orc2026.toFixed(2), " (esperado ~144.850.860,11 pela aba Realizado)");
console.log("Realizado 2026:", real2026.toFixed(2));
console.log("Em Pagamento 2026:", emp2026.toFixed(2));
console.log("Realizado+EmPgto 2026:", (real2026+emp2026).toFixed(2), " (esperado 53.747.780,11)");
console.log("Compromisso (dedup, todos os anos):", compromissoTotal.toFixed(2), " (esperado 46.652.308,16)");
