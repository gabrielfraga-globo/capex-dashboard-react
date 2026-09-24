import { readFileSync } from "node:fs";
const d = JSON.parse(readFileSync("public/data/carteira-processed.json", "utf-8"));
const sum = (field) => d.projetos.reduce((total, projeto) => total + (projeto[field] ?? 0), 0);
console.table({
  projetos: d.projetos.length,
  comOrcamento: d.projetos.filter((p) => p.origemOrcamento).length,
  comRealizado: d.projetos.filter((p) => p.origemRealizado).length,
  orcamento2026: sum("orcamento2026"),
  realizado2026: sum("realizado2026"),
  emPagamento2026: sum("emPagamento2026"),
  compromisso: sum("compromisso"),
});
