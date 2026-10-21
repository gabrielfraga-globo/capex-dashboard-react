import { useMemo } from "react";
import type { ProjetoBase, ProjetoMetricas } from "../types";
import { formatarIsoLocal } from "../lib/format";
import { aplicarFiltroRubrica } from "../lib/rubrica";
import { projetoNoRecorteComRubrica, rcNoRecorte, type Recorte } from "../lib/recorte";
import { useRecorteStore } from "../store/recorteStore";
import { usePortfolioData } from "../hooks/usePortfolioData";
import { useCuration } from "../features/radar/useCuration";
import { buildOperationalRows, type OperationalRow } from "../features/radar/operational";
import { parseDateBR } from "../features/executivo/useCarteiraResumo";
import {
  premissaSimples,
  premissaCompleta,
  projetoAtivo2026,
  type PremissaSimples,
  type PremissaCompleta,
} from "./metricas";

export interface MetricasOpcoes {
  lista: ProjetoMetricas[];
  dataBase?: string | null;
}

export interface Metricas {
  universo: { ativos: number; total: number };
  simples: PremissaSimples;
  completa: PremissaCompleta;
  projetos: ProjetoBase[];
  linhas: OperationalRow[];
}

/**
 * Premissa de cálculo da Diretoria. O recorte do `useRecorteStore` é aplicado uma única vez:
 * projetos pelo recorte (com filtro de rubrica) e linhas pelos RCs do recorte.
 */
export function useMetricas({ lista, dataBase }: MetricasOpcoes): Metricas | null {
  const { bundle, curationMap, rcViews } = useCuration();
  const { parsed } = usePortfolioData();
  const programa = useRecorteStore((s) => s.programa);
  const rubricas = useRecorteStore((s) => s.rubricas);
  const gestor = useRecorteStore((s) => s.gestor);
  const aprovador = useRecorteStore((s) => s.aprovador);
  const busca = useRecorteStore((s) => s.busca);

  const recorte = useMemo<Recorte>(
    () => ({ programa, rubricas, gestor, aprovador, busca }),
    [programa, rubricas, gestor, aprovador, busca]
  );
  const projetoPorNome = useMemo(() => new Map((parsed?.projetos ?? []).map((p) => [p.nome, p])), [parsed]);

  return useMemo<Metricas | null>(() => {
    if (!bundle) return null;
    const dbDate = parseDateBR(dataBase) || new Date();
    const referenceDateStr = formatarIsoLocal(dbDate);

    const noRecorte = lista.filter((p) => projetoNoRecorteComRubrica(p, recorte));
    const projetos: ProjetoBase[] = rubricas.length > 0 ? aplicarFiltroRubrica(noRecorte, rubricas) : noRecorte;

    const rcsNoRecorte = new Set(
      rcViews.filter((rc) => rcNoRecorte(rc, recorte, projetoPorNome, bundle.exerciseYear)).map((rc) => rc.rc)
    );
    const linhas = buildOperationalRows(bundle, curationMap, referenceDateStr).filter((row) => rcsNoRecorte.has(row.rc));

    return {
      universo: { ativos: projetos.filter((p) => projetoAtivo2026(p, linhas)).length, total: projetos.length },
      simples: premissaSimples(projetos, linhas),
      completa: premissaCompleta(projetos, linhas),
      projetos,
      linhas,
    };
  }, [bundle, curationMap, rcViews, lista, recorte, projetoPorNome, rubricas, dataBase]);
}
