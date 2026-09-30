import type { ProjetoBase } from "../types";

/**
 * Filtro de Rubrica (iteração 8): recalcula os valores de cada projeto somando só as rubricas escolhidas
 * (a partir de `porRubrica`, gerado pelo preprocessador) e tira da lista os projetos que ficam zerados.
 * Sem rubricas escolhidas devolve a própria lista — nenhum número muda.
 */
export function aplicarFiltroRubrica<T extends ProjetoBase>(lista: T[], rubricas: string[]): T[] {
  if (!rubricas.length) return lista;
  const out: T[] = [];
  for (const p of lista) {
    let o26 = 0, o27 = 0, r26 = 0, e26 = 0, r27 = 0, e27 = 0, comp = 0;
    const exec26 = Array(12).fill(0) as number[];
    const plan26 = Array(12).fill(0) as number[];
    const plan27 = Array(3).fill(0) as number[];
    for (const rub of rubricas) {
      const d = p.porRubrica?.[rub];
      if (!d) continue;
      o26 += d.orcamento2026; o27 += d.orcamento2027;
      r26 += d.realizado2026; e26 += d.emPagamento2026;
      r27 += d.realizado2027; e27 += d.emPagamento2027;
      comp += d.compromisso;
      d.executadoMensal2026?.forEach((v, i) => { exec26[i] += v; });
      d.meses2026?.forEach((v, i) => { plan26[i] += v; });
      d.meses2027?.forEach((v, i) => { plan27[i] += v; });
    }
    if (![o26, o27, r26, e26, r27, e27, comp].some((v) => v !== 0)) continue;
    out.push({
      ...p,
      orcamento2026: o26, orcamento2027: o27,
      realizado2026: r26, emPagamento2026: e26,
      realizado2027: r27, emPagamento2027: e27,
      compromisso: comp,
      executadoMensal2026: exec26,
      meses2026: plan26, meses2027: plan27,
      h1_2026: plan26.slice(0, 6).reduce((a, b) => a + b, 0),
      h2_2026: plan26.slice(6).reduce((a, b) => a + b, 0),
      // valores de fonte (DAX) não são por rubrica: não usar com filtro
      aEmitirFonte: null, deltaCaixaFonte: null,
    });
  }
  return out;
}

/** Rubricas que têm algum valor na carteira (esconde rubricas vazias, ex.: NAO_INFORMADA com tudo zero). */
export function rubricasDisponiveis(lista: ProjetoBase[]): string[] {
  const tot = new Map<string, number>();
  for (const p of lista) {
    for (const [rub, d] of Object.entries(p.porRubrica ?? {})) {
      const v = Math.abs(d.orcamento2026) + Math.abs(d.orcamento2027) + Math.abs(d.realizado2026) + Math.abs(d.emPagamento2026) + Math.abs(d.compromisso);
      tot.set(rub, (tot.get(rub) ?? 0) + v);
    }
  }
  return [...tot].filter(([, v]) => v > 0).map(([r]) => r).sort((a, b) => a.localeCompare(b, "pt-BR"));
}
