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
// Leitura da aba "Realizado" (tabela dinâmica hierárquica: Ano > N4 > Aprovador > Projeto)
// ----------------------------------------------------------------------------

function parseRealizado(sheet: XLSX.WorkSheet, ignoradas: LinhaIgnorada[]): RealizadoAnual[] {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const out: RealizadoAnual[] = [];

  let curAno: "2026" | "2027" | null = null;
  let curN4: string | null = null;
  let curAprovador: string | null = null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c === null)) continue;

    const anoCell = row[0];
    const n4Cell = row[1] as string | null;
    const aprovCell = row[2] as string | null;
    const nomeCell = row[3] as string | null;

    if (anoCell !== null && anoCell !== undefined) {
      if (anoCell === "Total") { curAno = null; continue; } // total geral (2026+2027) — pular, recalculamos
      curAno = String(anoCell) as "2026" | "2027";
      curN4 = null;
      curAprovador = null;
    }
    if (!curAno) continue; // estamos dentro do bloco "Total geral" — ignorar (evita dupla contagem)

    if (n4Cell) { curN4 = n4Cell; curAprovador = null; }
    if (aprovCell) curAprovador = aprovCell;

    if (!nomeCell || nomeCell === "Total") continue; // subtotal de plataforma/aprovador — ignorar

    if (!curN4) {
      ignoradas.push({ aba: "Realizado", motivo: "N4 não resolvido", contexto: nomeCell });
      continue;
    }

    const orcamento = toNumberOrNull(row[4]) ?? 0;
    const realizado = toNumberOrNull(row[5]) ?? 0;
    const emPagamento = toNumberOrNull(row[6]) ?? 0;
    const deltaCaixa = toNumberOrNull(row[7]) ?? orcamento - realizado - emPagamento;
    const compromisso = toNumberOrNull(row[8]) ?? 0;
    const aEmitir = toNumberOrNull(row[9]) ?? deltaCaixa - compromisso;

    out.push({
      ano: curAno,
      n4: curN4,
      aprovador: curAprovador,
      nomeLB: nomeCell,
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
  ignoradas: LinhaIgnorada[]
): { projetos: ProjetoBase[]; soOrcamento: string[]; soRealizado: string[] } {
  const gestorPorN4 = new Map(gestores.map((g) => [normalizeKey(g.n4), g]));

  const orcMap = new Map<string, OrcamentoAnual>();
  for (const o of orcamento) orcMap.set(`${normalizeKey(o.n4)}|${normalizeKey(o.nomeLB)}`, o);

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
      realizado2026: r ? r.realizado2026 : null,
      emPagamento2026: r ? r.emPagamento2026 : null,
      realizado2027: r ? r.realizado2027 : null,
      emPagamento2027: r ? r.emPagamento2027 : null,
      compromisso,
      origemOrcamento: !!o,
      origemRealizado: !!r,
    });
  }

  return { projetos, soOrcamento, soRealizado };
}

// ----------------------------------------------------------------------------
// Entrada pública
// ----------------------------------------------------------------------------

export async function parseWorkbookBuffer(buf: ArrayBuffer, nomeArquivo: string): Promise<RelatorioParsing> {
  const wb = XLSX.read(buf, { type: "array", cellDates: false });

  const ignoradas: LinhaIgnorada[] = [];

  const requiredSheets = ["Orçamento", "Realizado", "Hierarquia", "Status Report"];
  for (const s of requiredSheets) {
    if (!wb.SheetNames.includes(s)) {
      throw new Error(`Aba obrigatória não encontrada: "${s}". Abas disponíveis: ${wb.SheetNames.join(", ")}`);
    }
  }

  const orcamento = parseOrcamento(wb.Sheets["Orçamento"], ignoradas);
  const realizado = parseRealizado(wb.Sheets["Realizado"], ignoradas);
  const gestores = parseHierarquia(wb.Sheets["Hierarquia"]);
  const statusReportValores = parseStatusReport(wb.Sheets["Status Report"]);

  const { projetos, soOrcamento, soRealizado } = buildProjetos(orcamento, realizado, gestores, ignoradas);

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
  };
}

export async function parseExcelFile(file: File): Promise<RelatorioParsing> {
  const buf = await file.arrayBuffer();
  return parseWorkbookBuffer(buf, file.name);
}
