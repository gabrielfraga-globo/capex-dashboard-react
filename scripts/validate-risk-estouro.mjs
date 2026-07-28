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
    const totalGeral = num(row[19]) ?? 0;
    out.set(currentN4+"|"+nomeLB, totalGeral);
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
    if(!a){a={real2026:0,emp2026:0,compromissos:[]}; map.set(key,a);}
    if(curAno==="2026"){ a.real2026 += num(row[5])??0; a.emp2026 += num(row[6])??0; }
    a.compromissos.push(num(row[8])??0);
  }
  return map;
}

const orc = parseOrcamento(wb.Sheets["Orçamento"]);
const real = parseRealizado(wb.Sheets["Realizado"]);

const allKeys = new Set([...orc.keys(), ...real.keys()]);
let estouro=0, baixoComprom=0, baixaExec=0, ok=0, semDados=0;
for (const k of allKeys) {
  const orcamentoPlurianual = orc.get(k) ?? null;
  const r = real.get(k);
  const compromisso = r ? Math.max(...r.compromissos, 0) : null;
  const executado2026 = r ? r.real2026 + r.emp2026 : null;
  // orcamento do periodo 2026 seria necessário separado; aqui só validamos o "estouro" plurianual e contagens grosseiras
  const valorComprometidoTotal = (executado2026 ?? 0) + (compromisso ?? 0);
  const desvio = orcamentoPlurianual !== null ? valorComprometidoTotal - orcamentoPlurianual : null;

  if (orcamentoPlurianual === null && compromisso === null) { semDados++; continue; }
  if (desvio !== null && desvio > 0) { estouro++; continue; }
  ok++; // sem replicar 100% a lógica de baixo comprometimento/baixa execução aqui, só checando estouro plurianual
}
console.log("Total projetos:", allKeys.size);
console.log("Estouro (Executado+Compromisso > Orç. Plurianual):", estouro);
console.log("Sem dados:", semDados);
console.log("Demais (a classificar por comprometimento/execução):", ok);
