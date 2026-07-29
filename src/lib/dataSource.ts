import { parseWorkbookBuffer } from "./excelParser";
import type { RelatorioParsing } from "../types";

/**
 * Camada de abstração da fonte de dados.
 *
 * HOJE: lê o(s) arquivo(s) Excel bundled em /public/data (substituídos mensalmente
 * por um fluxo automatizado — não requer upload manual nem rebuild da aplicação,
 * já que /public é servido como está, sem passar pelo bundler).
 *
 * FUTURO: quando a fonte migrar para BigQuery, só esta função muda — ela troca de
 * "fetch + parse de Excel" para "query + mapeamento de linhas", mas continua
 * devolvendo o mesmo formato RelatorioParsing. Nenhum componente visual depende
 * de como os dados chegam até aqui.
 *
 * Hoje o arquivo consolidado (carteira.xlsx) ainda traz as 4 abas num único
 * workbook (Orçamento/Realizado/Hierarquia/Status Report), pois é assim que o
 * arquivo de origem é gerado atualmente. Quando o fluxo mensal passar a gerar
 * carteira.xlsx / status.xlsx / hierarquia.xlsx separados, ajustar apenas a
 * lógica de fetch abaixo — a assinatura de loadPortfolioData() não muda.
 */

const DATA_URL = `${import.meta.env.BASE_URL}data/carteira.xlsx`;

export async function loadPortfolioData(): Promise<RelatorioParsing> {
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `Não foi possível carregar ${DATA_URL} (HTTP ${res.status}). Verifique se o arquivo está publicado em public/data/carteira.xlsx.`
    );
  }
  const buf = await res.arrayBuffer();
  return parseWorkbookBuffer(buf, "carteira.xlsx");
}
