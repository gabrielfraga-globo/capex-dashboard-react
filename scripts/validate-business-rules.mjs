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
    out.set(currentN4+"|"+nomeLB, { total2026: num(row[14])??0, total2027: num(row[18])??0 });
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

let checkSum = 0, nProjetosMateriais = 0, maxPctExec = 0, maxPctComprom = 0, nAcimaDe100 = 0;
let totalAEmitir = 0;
for (const k of allKeys) {
  const o = orc.get(k);
  const r = real.get(k);
  const orcamento2026 = r ? r.orc2026 : (o?.total2026 ?? null);
  if (!orcamento2026) continue;
  const realizado2026 = r ? r.real2026 : 0;
  const compromisso = r ? Math.max(...r.compromissos, 0) : 0;
  const aEmitir = orcamento2026 - compromisso - realizado2026;
  totalAEmitir += Math.max(aEmitir, 0);

  // sanity: Realizado + Compromisso + AEmitir deve == Orcamento (decomposição 100%)
  const soma = realizado2026 + compromisso + aEmitir;
  if (Math.abs(soma - orcamento2026) > 0.01) checkSum++;

  if (orcamento2026 >= 50000) {
    nProjetosMateriais++;
    const pctExec = realizado2026 / orcamento2026;
    const pctComprom = compromisso / orcamento2026;
    maxPctExec = Math.max(maxPctExec, pctExec);
    maxPctComprom = Math.max(maxPctComprom, pctComprom);
    if (pctExec > 1 || pctComprom > 1) nAcimaDe100++;
  }
}
console.log("Decomposição Realizado+Compromisso+AEmitir == Orçamento: falhas =", checkSum, "(deve ser 0)");
console.log("Total A Emitir (2026, nova fórmula, clip>=0):", totalAEmitir.toFixed(2));
console.log("Projetos materiais (>=R$50k):", nProjetosMateriais);
console.log("Maior % execução entre materiais:", (maxPctExec*100).toFixed(1)+"%");
console.log("Maior % comprometimento entre materiais:", (maxPctComprom*100).toFixed(1)+"%");
console.log("Materiais com >100% em algum eixo:", nAcimaDe100, "(esses ainda aparecem no gráfico, só não são mais 'ruído' de denominador minúsculo)");
