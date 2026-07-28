import type { ProjetoMetricas, RelatorioParsing, ValidacaoResultado } from "../types";
import { normalizeKey } from "./excelParser";

/** Tenta localizar um valor na aba Status Report por múltiplas variações de rótulo. */
function lookupStatusReport(sr: Record<string, number>, candidatos: string[]): number | null {
  for (const c of candidatos) {
    const k = normalizeKey(c);
    if (k in sr) return sr[k];
    // busca por substring (rótulos do Status Report costumam ter texto extra ao redor)
    const found = Object.keys(sr).find((key) => key.includes(k));
    if (found) return sr[found];
  }
  return null;
}

export function validarContraStatusReport(
  metricas2026: ProjetoMetricas[],
  parsed: RelatorioParsing
): ValidacaoResultado[] {
  const sr = parsed.statusReportValores;
  const results: ValidacaoResultado[] = [];

  const orcamentoPlurianual = metricas2026.reduce((a, p) => a + (p.orcamentoPlurianual ?? 0), 0);
  const orcamento2026 = metricas2026.reduce((a, p) => a + (p.orcamentoPeriodo ?? 0), 0);
  const executado2026 = metricas2026.reduce((a, p) => a + (p.executado ?? 0), 0);
  const compromisso = metricas2026.reduce((a, p) => a + (p.compromisso ?? 0), 0);
  const provisionado = executado2026 + compromisso;
  const aEmitir = metricas2026.reduce((a, p) => a + (p.aEmitir ?? 0), 0);

  const checks: { metrica: string; calculado: number; candidatos: string[]; causa: string }[] = [
    { metrica: "Orçamento Plurianual", calculado: orcamentoPlurianual, candidatos: ["orcamento plurianual", "orc plurianual"], causa: "Diferença de escopo entre abas (ex.: Pré-Produção ausente de Realizado)." },
    { metrica: "Orçamento 2026", calculado: orcamento2026, candidatos: ["orcamento 2026", "orc 2026", "orc. 2026"], causa: "Projetos presentes em uma aba e ausentes em outra." },
    { metrica: "Realizado + Em Pagamento 2026", calculado: executado2026, candidatos: ["realizado", "executado 2026"], causa: "Diferença de corte temporal (data-base) entre o Status Report e o arquivo carregado." },
    { metrica: "Compromisso", calculado: compromisso, candidatos: ["compromisso"], causa: "Divergência na deduplicação do compromisso entre seções de ano." },
    { metrica: "Provisionado (Executado + Compromisso)", calculado: provisionado, candidatos: ["provisionado"], causa: "Efeito acumulado das métricas acima." },
    { metrica: "A Emitir", calculado: aEmitir, candidatos: ["a emitir"], causa: "Depende de Orçamento e Compromisso — herda divergências dessas métricas." },
  ];

  for (const c of checks) {
    const referencia = lookupStatusReport(sr, c.candidatos);
    if (referencia === null) {
      results.push({
        metrica: c.metrica,
        valorCalculado: c.calculado,
        valorStatusReport: null,
        diferenca: null,
        situacao: "Sem referência",
        causaProvavel: "Rótulo não localizado na aba Status Report (pode usar nomenclatura diferente).",
      });
      continue;
    }
    const diferenca = c.calculado - referencia;
    const pctDiff = referencia !== 0 ? Math.abs(diferenca / referencia) : Math.abs(diferenca) > 0 ? 1 : 0;
    results.push({
      metrica: c.metrica,
      valorCalculado: c.calculado,
      valorStatusReport: referencia,
      diferenca,
      situacao: pctDiff < 0.005 ? "OK" : "Divergência",
      causaProvavel: pctDiff < 0.005 ? "—" : c.causa,
    });
  }

  return results;
}
