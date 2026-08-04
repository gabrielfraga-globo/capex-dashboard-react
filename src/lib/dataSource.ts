import type { RelatorioParsing } from "../types";

/**
 * Camada de abstração da fonte de dados.
 *
 * HOJE: lê o JSON pré-processado em build time, publicado em /public/data.
 *
 * FUTURO: quando a fonte migrar para BigQuery, só esta função muda — ela troca de
 * "fetch de JSON" para "query + mapeamento de linhas", mas continua
 * devolvendo o mesmo formato RelatorioParsing. Nenhum componente visual depende
 * de como os dados chegam até aqui.
 *
 * O pré-processamento do Excel ocorre no script scripts/preprocessExcel.mjs,
 * executado automaticamente no prebuild.
 */

const DATA_URL = `${import.meta.env.BASE_URL}data/carteira-processed.json`;

export async function loadPortfolioData(): Promise<RelatorioParsing> {
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `Não foi possível carregar ${DATA_URL} (HTTP ${res.status}). Verifique se o prebuild gerou public/data/carteira-processed.json.`
    );
  }
  return res.json() as Promise<RelatorioParsing>;
}
