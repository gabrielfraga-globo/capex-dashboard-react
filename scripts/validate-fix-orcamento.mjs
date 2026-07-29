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
  let curAno=null, curN4=null, curAprov=null;
  for (let i=1;i<rows.length;i++){
    const row=rows[i]; if(!row||row.every(c=>c===null))continue;
    if(row[0]!==null && row[0]!==undefined){ if(row[0]==="Total"){curAno=null;continue;} curAno=String(row[0]); curN4=null; curAprov=null;}
    if(!curAno) continue;
    if(row[1]){curN4=row[1]; curAprov=null;}
    if(row[2]) curAprov=row[2];
    const nome=row[3];
    if(!nome||nome==="Total"||!curN4) continue;
    const key = curN4+"|"+nome;
    let a = map.get(key);
    if(!a){a={orc2026:0,real2026:0,emp2026:0,orc2027:0,compromissos:[]}; map.set(key,a);}
    if(curAno==="2026"){ a.orc2026 += num(row[4])??0; a.real2026 += num(row[5])??0; a.emp2026 += num(row[6])??0; }
    else { a.orc2027 += num(row[4])??0; }
    a.compromissos.push(num(row[8])??0);
  }
  return map;
}

const orc = parseOrcamento(wb.Sheets["Orçamento"]);
const real = parseRealizado(wb.Sheets["Realizado"]);
const allKeys = new Set([...orc.keys(), ...real.keys()]);

let orcamento2026Total=0, real2026=0, emp2026=0, n2026ComOrcamento=0, nTotal=0;
for (const k of allKeys) {
  nTotal++;
  const o = orc.get(k);
  const r = real.get(k);
  const orcamento2026 = r ? r.orc2026 : (o?.total2026 ?? null);
  if (orcamento2026) { orcamento2026Total += orcamento2026; n2026ComOrcamento++; }
  if (r) { real2026 += r.real2026; emp2026 += r.emp2026; }
}
console.log("Total de projetos (união):", nTotal);
console.log("Orçamento 2026 (corrigido):", orcamento2026Total.toFixed(2), " <- deve bater com Streamlit: 144.850.860,11");
console.log("Realizado 2026:", real2026.toFixed(2));
console.log("Em Pagamento 2026:", emp2026.toFixed(2));
console.log("Realizado+EmPgto 2026:", (real2026+emp2026).toFixed(2), " <- deve bater: 53.747.780,11");
