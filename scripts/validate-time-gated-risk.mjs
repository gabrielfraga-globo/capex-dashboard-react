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
    out.set(currentN4+"|"+nomeLB, { total2026: num(row[14])??0, totalGeral: num(row[19])??0 });
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

const MES_ATUAL = 7; // Julho/2026
const mesesRestantes2026 = Math.max(12 - MES_ATUAL, 0); // 5

let counts = { Estouro:0, "Risco de Não Realização":0, "Normal":0, "Dados insuficientes":0 };

for (const k of allKeys) {
  const o = orc.get(k);
  const r = real.get(k);
  const orcamento2026 = r ? r.orc2026 : (o?.total2026 ?? null);
  const orcamentoPlurianual = o?.totalGeral ?? (r ? r.orc2026 + r.orc2027 : null);
  const compromisso = r ? Math.max(...r.compromissos, 0) : (orcamentoPlurianual !== null ? 0 : null);
  const exec2026 = r ? r.real2026 + r.emp2026 : (orcamento2026 !== null ? 0 : null);

  if (orcamento2026 === null && orcamentoPlurianual === null) { counts["Dados insuficientes"]++; continue; }
  const desvioPlurianual = (exec2026 ?? 0) + (compromisso ?? 0) - (orcamentoPlurianual ?? 0);
  if (desvioPlurianual > 0) { counts["Estouro"]++; continue; }
  if (orcamento2026 === null || orcamento2026 <= 0) { counts["Dados insuficientes"]++; continue; }

  const cobertura = ((exec2026??0) + (compromisso??0)) / orcamento2026;
  if (cobertura < 0.95 && mesesRestantes2026 < 6) { counts["Risco de Não Realização"]++; }
  else { counts["Normal"]++; }
}
console.log("Meses restantes (2026, base julho):", mesesRestantes2026, "(< 6? ", mesesRestantes2026<6, ")");
console.log(counts);
console.log("Total:", Object.values(counts).reduce((a,b)=>a+b,0), "(deve ser 209)");
