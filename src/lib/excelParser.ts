import * as XLSX from "xlsx";
import type { Gestor, LinhaIgnorada, OrcamentoAnual, ProjetoBase, RealizadoAnual, RelatorioParsing } from "../types";

// ----------------------------------------------------------------------------
// Utilitários de normalização
// ----------------------------------------------------------------------------

/** Remove acentos, colapsa espaços e baixa-caixa — usado só para CHAVE de junção,
 * nunca para exibição (o nome original é sempre preservado). */
export function normalizeKey(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    // aceita formato brasileiro (1.234,56) e americano (1234.56)
    const cleaned = v.trim();
    if (cleaned === "") return null;
    const brFormat = /^-?\d{1,3}(\.\d{3})*(,\d+)?$/;
    let normalized = cleaned;
    if (brFormat.test(cleaned)) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    }
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}


// ----------------------------------------------------------------------------
// Leitura da aba "Orçamento"
// ----------------------------------------------------------------------------

function parseOrcamento(sheet: XLSX.WorkSheet, ignoradas: LinhaIgnorada[]): OrcamentoAnual[] {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const out: OrcamentoAnual[] = [];
  let currentN4: string | null = null;

  // dados começam na linha 4 (índice 3): header em 1-3 (Ano, Mês, N4/NomeLB)
  for (let i = 3; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c === null)) continue;

    const n4Cell = row[0] as string | null;
    const nomeLB = row[1] as string | null;

    if (n4Cell) currentN4 = n4Cell; // célula mesclada: preenche para baixo

    if (!nomeLB || nomeLB === "Total") {
      if (nomeLB === "Total") continue; // linha de subtotal por plataforma — ignorar
      ignoradas.push({ aba: "Orçamento", motivo: "NomeLB vazio", contexto: JSON.stringify(row).slice(0, 120) });
      continue;
    }
    if (!currentN4) {
      ignoradas.push({ aba: "Orçamento", motivo: "N4 não resolvido (fora de bloco mesclado)", contexto: nomeLB });
      continue;
    }

    // colunas: C..N = jan..dez/2026 (índices 2..13), O = Total2026 (14),
    // P..R = jan..mar/2027 (15..17), S = Total2027 (18), T = TotalGeral (19)
    const meses2026 = [];
    for (let c = 2; c <= 13; c++) meses2026.push(toNumberOrNull(row[c]) ?? 0);
    const total2026 = toNumberOrNull(row[14]) ?? meses2026.reduce((a, b) => a + b, 0);
    const meses2027 = [];
    for (let c = 15; c <= 17; c++) meses2027.push(toNumberOrNull(row[c]) ?? 0);
    const total2027 = toNumberOrNull(row[18]) ?? meses2027.reduce((a, b) => a + b, 0);
    const totalGeral = toNumberOrNull(row[19]) ?? total2026 + total2027;

    out.push({ n4: currentN4, nomeLB, meses2026, total2026, meses2027, total2027, totalGeral });
  }
  return out;
}

// ----------------------------------------------------------------------------
// Leitura da aba "Realizado" (tabela dinâmica: N4 > 1º Aprovador > NomeLB > Ano >
// Rubrica > REQ_COMPRA — nível de detalhe adicionado na extração "sem tratamento").
// A linha que queremos é a de nível "Ano": Ano preenchido diretamente na própria
// linha (não herdado) + Rubrica === "Total" + REQ_COMPRA vazio.
// ----------------------------------------------------------------------------

function parseRealizado(sheet: XLSX.WorkSheet, ignoradas: LinhaIgnorada[]): RealizadoAnual[] {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const out: RealizadoAnual[] = [];

  let curN4: string | null = null;
  let curAprovador: string | null = null;
  let curNomeLB: string | null = null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c === null)) continue;

    const n4Cell = row[0] as string | null;
    const aprovCell = row[1] as string | null;
    const nomeCell = row[2] as string | null;
    const anoCell = row[3];
    const rubricaCell = row[4] as string | null;
    const reqCompraCell = row[5];

    if (n4Cell) { curN4 = n4Cell; curAprovador = null; curNomeLB = null; }
    if (n4Cell === "Total") continue; // linha de total geral (todas as plataformas) — recalculamos
    if (aprovCell) { curAprovador = aprovCell; curNomeLB = null; }
    if (nomeCell) curNomeLB = nomeCell;

    if (!curNomeLB || curNomeLB === "Total") continue; // subtotal de plataforma/aprovador — ignorar

    // linha de nível "Ano": só aceitamos quando Ano está na PRÓPRIA linha (não herdado)
    if ((anoCell !== 2026 && anoCell !== 2027) || rubricaCell !== "Total" || reqCompraCell !== null) continue;

    if (!curN4) {
      ignoradas.push({ aba: "Realizado", motivo: "N4 não resolvido", contexto: curNomeLB });
      continue;
    }

    const orcamento = toNumberOrNull(row[6]) ?? 0;
    const realizado = toNumberOrNull(row[7]) ?? 0;
    const emPagamento = toNumberOrNull(row[8]) ?? 0;
    const deltaCaixa = toNumberOrNull(row[9]) ?? orcamento - realizado - emPagamento;
    const compromisso = toNumberOrNull(row[10]) ?? 0;
    const aEmitir = toNumberOrNull(row[11]) ?? deltaCaixa - compromisso;

    out.push({
      ano: String(anoCell) as "2026" | "2027",
      n4: curN4,
      aprovador: curAprovador,
      nomeLB: curNomeLB,
      orcamento,
      realizado,
      emPagamento,
      deltaCaixa,
      compromisso,
      aEmitir,
    });
  }
  return out;
}

// ----------------------------------------------------------------------------
// Leitura da aba "Realizado detalhado" (transação a transação, com data real de
// pagamento — "NF_DT_PAGAMENTO"). Usada SOMENTE para reconstruir o fluxo mensal
// real de Executado; nunca exposta ao diretor. Cada linha é uma nota fiscal
// distinta (Realizado Pago) ou um item pendente de pagamento (Realizado Pendente),
// nunca os dois ao mesmo tempo.
// ----------------------------------------------------------------------------

export interface RealizadoDetalhadoLinha {
  n4: string;
  nomeLB: string;
  data: Date;
  pago: number;
  pendente: number;
}

function parseRealizadoDetalhado(sheet: XLSX.WorkSheet, ignoradas: LinhaIgnorada[]): RealizadoDetalhadoLinha[] {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const out: RealizadoDetalhadoLinha[] = [];

  // colunas: N4(0), NomeLB(1), Rubrica(2), REQ_COMPRA(3), NOTA_FISCAL(4),
  // NF_DT_PAGAMENTO(5), EXP_COMMENT(6), 1º Aprovador(7), DeltaCaixa_CAPEX(8),
  // Orcamento_Cenarios(9), Realizado Pago(10), Realizado Pendente(11),
  // Compromisso_Conecta(12), A emitir_Conecta_CAPEX(13)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c === null)) continue;

    const n4 = row[0] as string | null;
    const nomeLB = row[1] as string | null;
    const reqCompra = row[3];
    const dataCell = row[5];
    const pago = toNumberOrNull(row[10]);
    const pendente = toNumberOrNull(row[11]);

    // ignora a linha de total geral (N4 === "Total", sem REQ_COMPRA) e a nota de filtros
    if (!n4 || n4 === "Total" || reqCompra === null || reqCompra === undefined) continue;
    if (!nomeLB) continue;

    if (!(dataCell instanceof Date)) {
      if (pago || pendente) {
        ignoradas.push({ aba: "Realizado detalhado", motivo: "Linha com valor mas sem NF_DT_PAGAMENTO válida — ignorada (evita fluxo sem data real)", contexto: nomeLB });
      }
      continue;
    }
    if (!pago && !pendente) continue; // linha sem valor financeiro — nada a somar

    out.push({ n4, nomeLB, data: dataCell, pago: pago ?? 0, pendente: pendente ?? 0 });
  }
  return out;
}



// ----------------------------------------------------------------------------
// Leitura da aba "Hierarquia"
// ----------------------------------------------------------------------------

function parseHierarquia(sheet: XLSX.WorkSheet): Gestor[] {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const out: Gestor[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[1]) continue;
    out.push({ n3: String(row[0] ?? ""), n4: String(row[1] ?? ""), nome: String(row[2] ?? ""), email: String(row[3] ?? "") });
  }
  return out;
}

// ----------------------------------------------------------------------------
// Leitura da aba "Status Report" (só os pares rótulo/valor numérico, para validação)
// ----------------------------------------------------------------------------

function parseStatusReport(sheet: XLSX.WorkSheet): Record<string, number> {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (!row) continue;
    for (let c = 0; c < row.length - 1; c++) {
      const label = row[c];
      const val = row[c + 1];
      if (typeof label === "string" && typeof val === "number" && label.trim().length > 3) {
        out[normalizeKey(label)] = val;
      }
    }
  }
  return out;
}

// ----------------------------------------------------------------------------
// Junção (Orçamento + Realizado + Hierarquia) → ProjetoBase[]
// ----------------------------------------------------------------------------

const PLATAFORMA_CURTA: Record<string, string> = {
  "Plat. De Captação E Produção": "Captação e Produção",
  "Plat. De Pós-Prod. E Design": "Pós-Produção e Design",
  "Plat. De Metadados E Mídias": "Metadados e Mídias",
  "Plataforma De Pré-Produção": "Pré-Produção",
};

function buildProjetos(
  orcamento: OrcamentoAnual[],
  realizado: RealizadoAnual[],
  gestores: Gestor[],
  ignoradas: LinhaIgnorada[],
  realizadoDetalhado: RealizadoDetalhadoLinha[] = []
): { projetos: ProjetoBase[]; soOrcamento: string[]; soRealizado: string[] } {
  const gestorPorN4 = new Map(gestores.map((g) => [normalizeKey(g.n4), g]));

  const orcMap = new Map<string, OrcamentoAnual>();
  for (const o of orcamento) orcMap.set(`${normalizeKey(o.n4)}|${normalizeKey(o.nomeLB)}`, o);

  // Fluxo mensal REAL de Executado por projeto, a partir da data de pagamento de cada
  // transação (aba Realizado detalhado). Só existe quando a aba está presente — nunca
  // interpolado/estimado. Índice 0 = janeiro, 11 = dezembro (só ano corrente, 2026).
  const executadoMensalMap = new Map<string, number[]>();
  for (const linha of realizadoDetalhado) {
    const key = `${normalizeKey(linha.n4)}|${normalizeKey(linha.nomeLB)}`;
    if (linha.data.getFullYear() !== 2026) continue; // fluxo mensal real só cobre o ano corrente
    let arr = executadoMensalMap.get(key);
    if (!arr) { arr = Array(12).fill(0); executadoMensalMap.set(key, arr); }
    arr[linha.data.getMonth()] += linha.pago + linha.pendente;
  }

  // agrupa Realizado por chave, deduplicando Compromisso (mesmo valor repetido em 2026 e 2027)
  type Agg = {
    n4: string;
    nomeLB: string;
    aprovador: string | null;
    orcamento2026: number; realizado2026: number; emPagamento2026: number;
    orcamento2027: number; realizado2027: number; emPagamento2027: number;
    compromissos: number[]; // valores vistos, para checar consistência
  };
  const realMap = new Map<string, Agg>();
  for (const r of realizado) {
    const key = `${normalizeKey(r.n4)}|${normalizeKey(r.nomeLB)}`;
    let agg = realMap.get(key);
    if (!agg) {
      agg = { n4: r.n4, nomeLB: r.nomeLB, aprovador: r.aprovador, orcamento2026: 0, realizado2026: 0, emPagamento2026: 0, orcamento2027: 0, realizado2027: 0, emPagamento2027: 0, compromissos: [] };
      realMap.set(key, agg);
    }
    if (r.ano === "2026") { agg.orcamento2026 += r.orcamento; agg.realizado2026 += r.realizado; agg.emPagamento2026 += r.emPagamento; }
    else { agg.orcamento2027 += r.orcamento; agg.realizado2027 += r.realizado; agg.emPagamento2027 += r.emPagamento; }
    agg.compromissos.push(r.compromisso);
    if (!agg.aprovador && r.aprovador) agg.aprovador = r.aprovador;
  }

  const allKeys = new Set<string>([...orcMap.keys(), ...realMap.keys()]);
  const projetos: ProjetoBase[] = [];
  const soOrcamento: string[] = [];
  const soRealizado: string[] = [];

  for (const key of allKeys) {
    const o = orcMap.get(key);
    const r = realMap.get(key);
    if (o && !r) soOrcamento.push(o.nomeLB);
    if (r && !o) soRealizado.push(r.nomeLB);

    const n4 = o?.n4 ?? r?.n4 ?? "";
    const nome = o?.nomeLB ?? r?.nomeLB ?? "";
    const gestor = gestorPorN4.get(normalizeKey(n4)) ?? null;

    // Compromisso: valida que os valores vistos entre anos são consistentes (mesmo valor esperado);
    // usa o máximo como dedup seguro e registra divergência se houver.
    let compromisso: number | null = null;
    if (r && r.compromissos.length > 0) {
      const uniq = Array.from(new Set(r.compromissos.map((v) => Math.round(v * 100))));
      compromisso = r.compromissos.reduce((a, b) => Math.max(a, b), 0);
      if (uniq.length > 1) {
        ignoradas.push({
          aba: "Realizado",
          motivo: "Compromisso divergente entre seções de ano para o mesmo projeto — usado o maior valor",
          contexto: nome,
        });
      }
    }

    // Orçamento por período: a aba Realizado é a fonte primária (cobre 205 dos 209 projetos
    // e é a mesma fonte já validada contra o Status Report). A aba Orçamento só é usada como
    // fallback para os 4 projetos que existem exclusivamente nela (ex.: Pré-Produção) — assim
    // nenhuma linha de orçamento é omitida por um projeto existir em só uma das duas abas.
    const orcamento2026 = r ? r.orcamento2026 : o?.total2026 ?? null;
    const orcamento2027 = r ? r.orcamento2027 : o?.total2027 ?? null;
    const orcamentoPlurianualBruto = o?.totalGeral ?? null;
    const orcamentoPlurianual =
      orcamentoPlurianualBruto ?? (orcamento2026 !== null || orcamento2027 !== null ? (orcamento2026 ?? 0) + (orcamento2027 ?? 0) : null);

    projetos.push({
      id: key,
      nome,
      n4,
      n4Curta: PLATAFORMA_CURTA[n4] ?? n4,
      gestor: gestor?.nome ?? null,
      gestorEmail: gestor?.email ?? null,
      aprovador: r?.aprovador ?? null,
      orcamentoPlurianual,
      orcamento2026,
      orcamento2027,
      h1_2026: o ? o.meses2026.slice(0, 6).reduce((a, b) => a + b, 0) : null,
      h2_2026: o ? o.meses2026.slice(6, 12).reduce((a, b) => a + b, 0) : null,
      meses2026: o ? o.meses2026 : null,
      meses2027: o ? o.meses2027 : null,
      realizado2026: r ? r.realizado2026 : null,
      emPagamento2026: r ? r.emPagamento2026 : null,
      realizado2027: r ? r.realizado2027 : null,
      emPagamento2027: r ? r.emPagamento2027 : null,
      compromisso,
      origemOrcamento: !!o,
      origemRealizado: !!r,
      executadoMensal2026: executadoMensalMap.get(key) ?? null,
    });
  }

  return { projetos, soOrcamento, soRealizado };
}

// ----------------------------------------------------------------------------
// Entrada pública
// ----------------------------------------------------------------------------

export async function parseWorkbookBuffer(buf: ArrayBuffer, nomeArquivo: string): Promise<RelatorioParsing> {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  const ignoradas: LinhaIgnorada[] = [];

  const requiredSheets = ["Orçamento", "Realizado", "Hierarquia"];
  for (const s of requiredSheets) {
    if (!wb.SheetNames.includes(s)) {
      throw new Error(`Aba obrigatória não encontrada: "${s}". Abas disponíveis: ${wb.SheetNames.join(", ")}`);
    }
  }

  const orcamento = parseOrcamento(wb.Sheets["Orçamento"], ignoradas);
  const realizado = parseRealizado(wb.Sheets["Realizado"], ignoradas);
  const gestores = parseHierarquia(wb.Sheets["Hierarquia"]);
  const statusReportValores = wb.SheetNames.includes("Status Report") ? parseStatusReport(wb.Sheets["Status Report"]) : {};
  const realizadoDetalhado = wb.SheetNames.includes("Realizado detalhado")
    ? parseRealizadoDetalhado(wb.Sheets["Realizado detalhado"], ignoradas)
    : [];

  const { projetos, soOrcamento, soRealizado } = buildProjetos(orcamento, realizado, gestores, ignoradas, realizadoDetalhado);

  return {
    projetos,
    gestores,
    linhasIgnoradas: ignoradas,
    projetosSoOrcamento: soOrcamento,
    projetosSoRealizado: soRealizado,
    dataBase: new Date().toLocaleDateString("pt-BR"),
    nomeArquivo,
    atualizadoEm: new Date().toLocaleString("pt-BR"),
    statusReportValores,
    temFluxoMensalReal: realizadoDetalhado.length > 0,
  };
}

export async function parseExcelFile(file: File): Promise<RelatorioParsing> {
  const buf = await file.arrayBuffer();
  return parseWorkbookBuffer(buf, file.name);
}
