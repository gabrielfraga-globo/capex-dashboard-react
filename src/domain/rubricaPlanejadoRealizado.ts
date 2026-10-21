import type { ProjetoBase } from "../types";
import type { OperationalRow } from "../features/radar/operational";
import { ehDecisaoExcludente, ehPendenteDeCaixa } from "./metricas";
import { RUBRICAS_OCULTAS } from "../lib/rubrica";

export interface ResumoRubrica {
  rubrica: string;
  /** Orçamento mensal somado até o mês M-1 (mesmo corte do Fluxo de caixa). */
  planejado: number;
  /** Pago (realizado 2026, sem em pagamento). */
  realizado: number;
  /** Emitido elegível da premissa simples (sem decisão excludente). */
  comprometido: number;
}

const ORDEM_RUBRICAS = ["SOLUCAO", "MDO", "INSTALACAO", "RESERVA"];

export const chaveRubrica = (rubrica: string) =>
  rubrica.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/\s+/g, "_");
function ordenar(a: string, b: string): number {
  const ia = ORDEM_RUBRICAS.indexOf(chaveRubrica(a));
  const ib = ORDEM_RUBRICAS.indexOf(chaveRubrica(b));
  if (ia !== -1 || ib !== -1) return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
  return a.localeCompare(b, "pt-BR");
}

/**
 * Planejado × realizado × comprometido por rubrica. Usa os projetos e linhas já filtrados pelo recorte
 * (useMetricas). `rubricas` vazio = todas; senão só as escolhidas. Rubricas com Σ zero são omitidas.
 */
export function resumoPorRubrica({
  projetos,
  linhas,
  rubricas,
  mesesPlanejados,
}: {
  projetos: ProjetoBase[];
  linhas: OperationalRow[];
  rubricas: readonly string[];
  mesesPlanejados: number;
}): ResumoRubrica[] {
  const conhecidas = new Set<string>();
  for (const p of projetos) for (const r of Object.keys(p.porRubrica ?? {})) conhecidas.add(r);
  for (const l of linhas) for (const r of Object.keys(l.valueByRubrica ?? {})) conhecidas.add(r);

  const selecionadas = rubricas.length > 0 ? new Set(rubricas) : null;
  const nomes = [...conhecidas]
    .filter((r) => !RUBRICAS_OCULTAS.has(chaveRubrica(r)))
    .filter((r) => !selecionadas || selecionadas.has(r))
    .sort(ordenar);

  const mapa = new Map<string, ResumoRubrica>(
    nomes.map((rubrica) => [rubrica, { rubrica, planejado: 0, realizado: 0, comprometido: 0 }])
  );

  for (const p of projetos) {
    for (const [rubrica, d] of Object.entries(p.porRubrica ?? {})) {
      const acc = mapa.get(rubrica);
      if (!acc) continue;
      acc.planejado += d.meses2026.slice(0, mesesPlanejados).reduce((a, b) => a + b, 0);
      acc.realizado += d.realizado2026;
    }
  }

  for (const linha of linhas) {
    if (!ehPendenteDeCaixa(linha) || ehDecisaoExcludente(linha)) continue;
    for (const [rubrica, valor] of Object.entries(linha.valueByRubrica ?? {})) {
      const acc = mapa.get(rubrica);
      if (acc) acc.comprometido += valor;
    }
  }

  return [...mapa.values()].filter((r) => r.planejado !== 0 || r.realizado !== 0 || r.comprometido !== 0);
}
