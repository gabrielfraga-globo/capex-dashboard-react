import * as XLSX from "xlsx";
import fs from "fs";

const buf = fs.readFileSync("/mnt/user-data/uploads/carteira_revisada.xlsx");
const wb = XLSX.read(buf, { type: "buffer", cellDates: true });

function parseRealizado(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const out = [];
  let curN4 = null, curAprovador = null, curNomeLB = null;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => c === null)) continue;
    const n4Cell = row[0], aprovCell = row[1], nomeCell = row[2];
    const anoCell = row[3], rubricaCell = row[4], reqCompraCell = row[5];
    if (n4Cell) { curN4 = n4Cell; curAprovador = null; curNomeLB = null; }
    if (n4Cell === "Total") continue;
    if (aprovCell) { curAprovador = aprovCell; curNomeLB = null; }
    if (nomeCell) curNomeLB = nomeCell;
    if (!curNomeLB || curNomeLB === "Total") continue;
    if ((anoCell !== 2026 && anoCell !== 2027) || rubricaCell !== "Total" || reqCompraCell !== null) continue;
    out.push({
      ano: anoCell, n4: curN4, nomeLB: curNomeLB,
      orcamento: row[6] ?? 0, realizado: row[7] ?? 0, emPagamento: row[8] ?? 0,
      compromisso: row[10] ?? 0,
    });
  }
  return out;
}

function parseRealizadoDetalhado(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => c === null)) continue;
    const n4 = row[0], nomeLB = row[1], reqCompra = row[3], dataCell = row[5];
    const pago = row[10], pendente = row[11];
    if (!n4 || n4 === "Total" || reqCompra === null || reqCompra === undefined) continue;
    if (!nomeLB) continue;
    if (!(dataCell instanceof Date)) continue;
    if (!pago && !pendente) continue;
    out.push({ n4, nomeLB, data: dataCell, pago: pago ?? 0, pendente: pendente ?? 0 });
  }
  return out;
}

const realizado = parseRealizado(wb.Sheets["Realizado"]);
console.log("=== parseRealizado (novo layout) ===");
console.log("Linhas extraídas:", realizado.length);
const orc2026 = realizado.filter(r=>r.ano===2026).reduce((a,r)=>a+r.orcamento,0);
const real2026 = realizado.filter(r=>r.ano===2026).reduce((a,r)=>a+r.realizado,0);
const emp2026 = realizado.filter(r=>r.ano===2026).reduce((a,r)=>a+r.emPagamento,0);
console.log("Orçamento 2026:", orc2026.toFixed(2));
console.log("Realizado 2026:", real2026.toFixed(2));
console.log("EmPgto 2026:", emp2026.toFixed(2));
const orcTotal = realizado.reduce((a,r)=>{
  return a; // orcamento soma direto por ano já é aditivo, plurianual = soma 2026+2027
},0);
const orcPlurianual = realizado.reduce((a,r)=>a+r.orcamento,0);
console.log("Orçamento plurianual (soma todos anos):", orcPlurianual.toFixed(2), " (esperado 251.627.896,25)");

const detalhado = parseRealizadoDetalhado(wb.Sheets["Realizado detalhado"]);
console.log("\n=== parseRealizadoDetalhado ===");
console.log("Linhas extraídas:", detalhado.length);
const totalDet = detalhado.reduce((a,d)=>a+d.pago+d.pendente,0);
console.log("Soma total (Pago+Pendente):", totalDet.toFixed(2), " (esperado 59.520.722,64)");

// distribuição mensal (2026 apenas)
const mensal = Array(12).fill(0);
for (const d of detalhado) {
  if (d.data.getFullYear() !== 2026) continue;
  mensal[d.data.getMonth()] += d.pago + d.pendente;
}
console.log("\nDistribuição mensal 2026 (real, sem interpolação):");
const MESES=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
mensal.forEach((v,i)=> v>0 && console.log(" ", MESES[i], ":", v.toFixed(2)));
console.log("Soma mensal 2026:", mensal.reduce((a,b)=>a+b,0).toFixed(2));
