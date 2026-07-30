import * as XLSX from "xlsx";
import fs from "fs";

const buf = fs.readFileSync("/mnt/user-data/uploads/relatório.xlsx");
const wb = XLSX.read(buf, { type: "buffer" });
function num(v){ return (typeof v === "number" && Number.isFinite(v)) ? v : null; }

function parseOrcamento(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const out = new Map(); let currentN4=null;
  for (let i=3;i<rows.length;i++){
    const row=rows[i]; if(!row||row.every(c=>c===null))continue;
    if(row[0]) currentN4=row[0];
    const nomeLB=row[1];
    if(!nomeLB||nomeLB==="Total"||!currentN4) continue;
    out.set(currentN4+"|"+nomeLB, { total2026: num(row[14])??0, total2027: num(row[18])??0, totalGeral: num(row[19])??0 });
  }
  return out;
}
function parseRealizado(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const map = new Map();
  let curAno=null, curN4=null;
  for (let i=1;i<rows.length;i++){
    const row=rows[i]; if(!row||row.every(c=>c===null))continue;
    if(row[0]!==null && row[0]!==undefined){ if(row[0]==="Total"){curAno=null;continue;} curAno=String(row[0]); curN4=null;}
    if(!curAno) continue;
    if(row[1]) curN4=row[1];
    const nome=row[3];
    if(!nome||nome==="Total"||!curN4) continue;
    const key = curN4+"|"+nome;
    let a = map.get(key);
    if(!a){a={orc2026:0,real2026:0,emp2026:0,orc2027:0,real2027:0,emp2027:0,compromissos:[]}; map.set(key,a);}
    if(curAno==="2026"){ a.orc2026 += num(row[4])??0; a.real2026 += num(row[5])??0; a.emp2026 += num(row[6])??0; }
    else { a.orc2027 += num(row[4])??0; a.real2027 += num(row[5])??0; a.emp2027 += num(row[6])??0; }
    a.compromissos.push(num(row[8])??0);
  }
  return map;
}

const orc = parseOrcamento(wb.Sheets["Orçamento"]);
const real = parseRealizado(wb.Sheets["Realizado"]);

// --- Caso específico: Gnews no estúdio A, 2026 ---
const gnews = [...real.entries()].find(([k]) => k.toLowerCase().includes("gnews"))[1];
const orcamento2026 = gnews.orc2026;
const compromisso = Math.max(...gnews.compromissos, 0);
const executado2026 = gnews.real2026 + gnews.emp2026;
const aEmitirNovo = orcamento2026 - compromisso - executado2026;
console.log("=== Gnews no estúdio A (2026) — fórmula corrigida ===");
console.log("Orçamento:", orcamento2026.toFixed(2), "| Executado:", executado2026.toFixed(2), "| Emitido:", compromisso.toFixed(2));
console.log("A Emitir (Orçamento - Executado - Emitido):", aEmitirNovo.toFixed(2), " <- deve bater com -3.335,78");

// --- Reconciliação geral 2026 e Todos (plurianual) ---
const allKeys = new Set([...orc.keys(), ...real.keys()]);
let totalOrc2026=0, totalExec2026=0, totalEmitido=0, totalAEmitir2026=0;
let totalPlurianual=0, totalExecPlurianual=0, totalAEmitirPlurianual=0;
for (const k of allKeys) {
  const o = orc.get(k);
  const r = real.get(k);
  const orcamento2026 = r ? r.orc2026 : (o?.total2026 ?? 0);
  const orcamento2027 = r ? r.orc2027 : (o?.total2027 ?? 0);
  const compromisso = r ? Math.max(...r.compromissos, 0) : 0;
  const exec2026 = r ? r.real2026 + r.emp2026 : 0;
  const exec2027 = r ? r.real2027 + r.emp2027 : 0;
  const orcamentoPlurianual = o?.totalGeral ?? (orcamento2026 + orcamento2027);

  totalOrc2026 += orcamento2026;
  totalExec2026 += exec2026;
  totalEmitido += compromisso;
  totalAEmitir2026 += (orcamento2026 - compromisso - exec2026);

  totalPlurianual += orcamentoPlurianual;
  totalExecPlurianual += exec2026 + exec2027;
  totalAEmitirPlurianual += (orcamentoPlurianual - compromisso - (exec2026+exec2027));
}
console.log("\n=== Reconciliação 2026 ===");
console.log("Orçamento 2026:", totalOrc2026.toFixed(2), "(deve bater 144.985.588,39)");
console.log("Executado 2026:", totalExec2026.toFixed(2));
console.log("Emitido:", totalEmitido.toFixed(2));
console.log("A Emitir 2026 (nova fórmula):", totalAEmitir2026.toFixed(2));

console.log("\n=== Reconciliação Todos os anos (plurianual) ===");
console.log("Orçamento Plurianual:", totalPlurianual.toFixed(2), "(deve bater 251.762.624,53)");
console.log("Executado (2026+2027):", totalExecPlurianual.toFixed(2));
console.log("A Emitir Plurianual:", totalAEmitirPlurianual.toFixed(2));
