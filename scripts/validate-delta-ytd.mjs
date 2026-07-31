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
    const meses2026 = [];
    for (let c = 2; c <= 13; c++) meses2026.push(num(row[c]) ?? 0);
    out.set(currentN4+"|"+nomeLB, { meses2026, total2026: num(row[14])??0, totalGeral: num(row[19])??0 });
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
const allKeys = new Set([...orc.keys(), ...real.keys()]);

const MES_ATUAL = 7; // julho
let nEstouroNovo = 0, nEstouroAntigo = 0;
let planejadoAcum = 0, realizadoAcum = 0;

for (const k of allKeys) {
  const o = orc.get(k);
  const r = real.get(k);
  const orcamentoPlurianual = o?.totalGeral ?? (r ? r.orc2026 + r.orc2027 : null);
  const compromisso = r ? Math.max(...r.compromissos, 0) : 0;
  const execPlurianual = r ? (r.real2026 + r.emp2026 + r.real2027 + r.emp2027) : 0;

  if (orcamentoPlurianual !== null) {
    if (execPlurianual > orcamentoPlurianual) nEstouroNovo++;
    if (execPlurianual + compromisso > orcamentoPlurianual) nEstouroAntigo++;
  }

  // Delta YTD (2026), usando meses reais quando disponíveis
  if (o) {
    planejadoAcum += o.meses2026.slice(0, MES_ATUAL).reduce((a,b)=>a+b, 0);
  } else if (r) {
    planejadoAcum += r.orc2026 * (MES_ATUAL/12);
  }
  if (r) realizadoAcum += r.real2026;
}

console.log("Estouro (regra NOVA: só Realizado+EmPgto):", nEstouroNovo);
console.log("Estouro (regra ANTIGA: Realizado+EmPgto+Emitido):", nEstouroAntigo);
console.log("\nDelta YTD (2026, base julho):");
console.log("Planejado Acumulado (jan-jul):", planejadoAcum.toFixed(2));
console.log("Realizado Acumulado:", realizadoAcum.toFixed(2));
console.log("Delta YTD:", (planejadoAcum - realizadoAcum).toFixed(2));
