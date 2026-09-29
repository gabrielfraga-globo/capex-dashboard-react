import type {
  Gestor,
  LinhaIgnorada,
  OrcamentoAnual,
  ProjetoBase,
  RealizadoAnual,
  RelatorioParsing,
} from "../types/index.js";

export interface CsvCarteiraInput {
  orcamentoCsv: string;
  realizadoCsv: string;
  fluxoMensalCsv: string;
  gestores?: Gestor[];
  statusReportValores?: Record<string, number>;
}

interface FluxoMensalLinha {
  n4: string;
  nomeLB: string;
  ano: number;
  mes: number;
  pago: number;
}

export function normalizeKey(value: string | null | undefined): string {
  if (!value) return "";
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().replace(/\s+/g, " ").toLowerCase();
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function parseDelimitedCsv(text: string, delimiter = ";"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ""; }
    else if (ch === "\n") {
      row.push(field);
      if (row.some((item) => item.trim() !== "")) rows.push(row);
      row = []; field = "";
    } else field += ch;
  }

  row.push(field);
  if (row.some((item) => item.trim() !== "")) rows.push(row);
  return rows;
}

export function csvObjects(text: string): Array<Record<string, string>> {
  const rows = parseDelimitedCsv(text);
  if (!rows.length) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((values) => Object.fromEntries(
    headers.map((header, index) => [header, String(values[index] ?? "").trim()])
  ));
}

function requireHeaders(records: Array<Record<string, string>>, required: string[], source: string): void {
  if (!records.length) throw new Error(`${source}: CSV vazio.`);
  const available = new Set(Object.keys(records[0]));
  const missing = required.filter((header) => !available.has(header));
  if (missing.length) throw new Error(`${source}: colunas ausentes: ${missing.join(", ")}`);
}

const MONTH_INDEX: Record<string, number> = {
  janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

function parseOrcamentoCsv(text: string, _ignoradas: LinhaIgnorada[]): OrcamentoAnual[] {
  const records = csvObjects(text);
  requireHeaders(records, ["N4", "NomeLB", "Ano", "Nome do Mês", "BG_Q3"], "orcamento.csv");
  const map = new Map<string, OrcamentoAnual>();

  for (const record of records) {
    const n4 = record.N4?.trim();
    const nomeLB = record.NomeLB?.trim();
    const ano = Number(record.Ano);
    const mes = MONTH_INDEX[normalizeKey(record["Nome do Mês"] ?? "")];
    if (!n4 || !nomeLB || !Number.isInteger(mes) || ![2026, 2027].includes(ano)) continue;
    const key = `${normalizeKey(n4)}|${normalizeKey(nomeLB)}`;
    let item = map.get(key);
    if (!item) {
      item = { n4, nomeLB, meses2026: Array(12).fill(0), total2026: 0,
        meses2027: Array(3).fill(0), total2027: 0, totalGeral: 0 };
      map.set(key, item);
    }
    const valor = toNumberOrNull(record.BG_Q3) ?? 0;
    if (ano === 2026) item.meses2026[mes] += valor;
    else if (mes <= 2) item.meses2027[mes] += valor;
  }

  for (const item of map.values()) {
    item.total2026 = item.meses2026.reduce<number>((sum, value) => sum + value, 0);
    item.total2027 = item.meses2027.reduce<number>((sum, value) => sum + value, 0);
    item.totalGeral = item.total2026 + item.total2027;
  }
  return [...map.values()];
}

function parseRealizadoCsv(text: string): RealizadoAnual[] {
  const records = csvObjects(text);
  requireHeaders(records, ["N4", "1º Aprovador", "NomeLB", "Ano", "Orcamento_Cenarios",
    "Realizado_Pago", "Realizado_Pendente", "DeltaCaixa_CAPEX",
    "Compromisso_Conecta", "A_emitir_Conecta_CAPEX"], "Realizado.csv");

  return records.flatMap((record): RealizadoAnual[] => {
    const ano = Number(record.Ano);
    const n4 = record.N4?.trim();
    const nomeLB = record.NomeLB?.trim();
    if (!n4 || !nomeLB || ![2026, 2027].includes(ano)) return [];
    const orcamento = toNumberOrNull(record.Orcamento_Cenarios) ?? 0;
    const realizado = toNumberOrNull(record.Realizado_Pago) ?? 0;
    const emPagamento = toNumberOrNull(record.Realizado_Pendente) ?? 0;
    const deltaCaixa = toNumberOrNull(record.DeltaCaixa_CAPEX) ?? orcamento - realizado - emPagamento;
    const compromisso = toNumberOrNull(record.Compromisso_Conecta) ?? 0;
    const aEmitir = toNumberOrNull(record.A_emitir_Conecta_CAPEX) ?? deltaCaixa - compromisso;
    return [{ ano: String(ano) as "2026" | "2027", n4,
      aprovador: record["1º Aprovador"]?.trim() || null, nomeLB,
      orcamento, realizado, emPagamento, deltaCaixa, compromisso, aEmitir }];
  });
}

function parseFluxoMensalCsv(text: string): FluxoMensalLinha[] {
  const records = csvObjects(text);
  requireHeaders(records, ["N4", "NomeLB", "Ano", "Mês", "Realizado_Pago"], "Fluxo_Mensal.csv");
  return records.flatMap((record): FluxoMensalLinha[] => {
    const n4 = record.N4?.trim();
    const nomeLB = record.NomeLB?.trim();
    const ano = Number(record.Ano);
    const mesRaw = record["Mês"]?.trim();
    const mes = Number(mesRaw) || (MONTH_INDEX[normalizeKey(mesRaw)] ?? -1) + 1;
    if (!n4 || !nomeLB || ano !== 2026 || mes < 1 || mes > 12) return [];
    return [{ n4, nomeLB, ano, mes, pago: toNumberOrNull(record.Realizado_Pago) ?? 0 }];
  });
}

const PLATAFORMA_CURTA: Record<string, string> = {
  "Plat. De Captação E Produção": "Captação e Produção",
  "Plat. De Pós-Prod. E Design": "Pós-Produção e Design",
  "Plat. De Metadados E Mídias": "Metadados e Mídias",
  "Plataforma De Pré-Produção": "Pré-Produção",
};

function buildProjetos(
  orcamento: OrcamentoAnual[], realizado: RealizadoAnual[], gestores: Gestor[],
  _ignoradas: LinhaIgnorada[], fluxo: FluxoMensalLinha[]
): { projetos: ProjetoBase[]; soOrcamento: string[]; soRealizado: string[] } {
  const gestorPorN4 = new Map(gestores.map((g) => [normalizeKey(g.n4), g]));
  const orcMap = new Map(orcamento.map((o) => [`${normalizeKey(o.n4)}|${normalizeKey(o.nomeLB)}`, o]));
  const fluxoMap = new Map<string, number[]>();
  for (const linha of fluxo) {
    const key = `${normalizeKey(linha.n4)}|${normalizeKey(linha.nomeLB)}`;
    const meses = fluxoMap.get(key) ?? Array(12).fill(0);
    meses[linha.mes - 1] += linha.pago;
    fluxoMap.set(key, meses);
  }

  type Agg = { n4: string; nomeLB: string; aprovador: string | null;
    orcamento2026: number; realizado2026: number; emPagamento2026: number;
    orcamento2027: number; realizado2027: number; emPagamento2027: number;
    // somas por ano: com a granularidade por Rubrica há várias linhas por projeto/ano
    compromissos: Record<string, number>; aEmitirValues: Record<string, number>; deltaCaixaValues: Record<string, number> };
  const realMap = new Map<string, Agg>();
  for (const linha of realizado) {
    const key = `${normalizeKey(linha.n4)}|${normalizeKey(linha.nomeLB)}`;
    const agg: Agg = realMap.get(key) ?? { n4: linha.n4, nomeLB: linha.nomeLB, aprovador: linha.aprovador,
      orcamento2026: 0, realizado2026: 0, emPagamento2026: 0,
      orcamento2027: 0, realizado2027: 0, emPagamento2027: 0,
      compromissos: {}, aEmitirValues: {}, deltaCaixaValues: {} };
    if (linha.ano === "2026") {
      agg.orcamento2026 += linha.orcamento; agg.realizado2026 += linha.realizado;
      agg.emPagamento2026 += linha.emPagamento;
    } else {
      agg.orcamento2027 += linha.orcamento; agg.realizado2027 += linha.realizado;
      agg.emPagamento2027 += linha.emPagamento;
    }
    agg.compromissos[linha.ano] = (agg.compromissos[linha.ano] ?? 0) + linha.compromisso;
    agg.aEmitirValues[linha.ano] = (agg.aEmitirValues[linha.ano] ?? 0) + linha.aEmitir;
    agg.deltaCaixaValues[linha.ano] = (agg.deltaCaixaValues[linha.ano] ?? 0) + linha.deltaCaixa;
    if (!agg.aprovador && linha.aprovador) agg.aprovador = linha.aprovador;
    realMap.set(key, agg);
  }

  const keys = new Set([...orcMap.keys(), ...realMap.keys()]);
  const projetos: ProjetoBase[] = [];
  const soOrcamento: string[] = [];
  const soRealizado: string[] = [];
  for (const key of keys) {
    const orc = orcMap.get(key); const real = realMap.get(key);
    if (orc && !real) soOrcamento.push(orc.nomeLB);
    if (real && !orc) soRealizado.push(real.nomeLB);
    const n4 = orc?.n4 ?? real?.n4 ?? "";
    const nome = orc?.nomeLB ?? real?.nomeLB ?? "";
    const gestor = gestorPorN4.get(normalizeKey(n4));
    // o valor vem repetido nas linhas de 2026 e 2027: soma as rubricas dentro do ano e pega o maior ano
    const maxPorAno = (m?: Record<string, number>) => (m && Object.keys(m).length ? Math.max(...Object.values(m)) : null);
    const compromisso = maxPorAno(real?.compromissos);
    const aEmitirFonte = maxPorAno(real?.aEmitirValues);
    const deltaCaixaFonte = maxPorAno(real?.deltaCaixaValues);

    // CORREÇÃO CENTRAL: BG_Q3 é a fonte primária do orçamento do dashboard.
    const orcamento2026 = orc ? orc.total2026 : 0;
    const orcamento2027 = orc ? orc.total2027 : 0;
    const orcamentoPlurianual = orc ? orc.totalGeral : 0;

    projetos.push({ id: key, nome, n4, n4Curta: PLATAFORMA_CURTA[n4] ?? n4,
      gestor: gestor?.nome ?? null, gestorEmail: gestor?.email ?? null,
      aprovador: real?.aprovador ?? null, orcamentoPlurianual, orcamento2026, orcamento2027,
      h1_2026: orc ? orc.meses2026.slice(0, 6).reduce<number>((a, b) => a + b, 0) : null,
      h2_2026: orc ? orc.meses2026.slice(6).reduce<number>((a, b) => a + b, 0) : null,
      meses2026: orc?.meses2026 ?? null, meses2027: orc?.meses2027 ?? null,
      realizado2026: real?.realizado2026 ?? null, emPagamento2026: real?.emPagamento2026 ?? null,
      realizado2027: real?.realizado2027 ?? null, emPagamento2027: real?.emPagamento2027 ?? null,
      compromisso, aEmitirFonte, deltaCaixaFonte,
      origemOrcamento: Boolean(orc), origemRealizado: Boolean(real),
      executadoMensal2026: fluxoMap.get(key) ?? null });
  }
  return { projetos, soOrcamento, soRealizado };
}

export function parseCsvCarteira(input: CsvCarteiraInput, nomeArquivo = "CSV DAX Studio"): RelatorioParsing {
  const ignoradas: LinhaIgnorada[] = [];
  const gestores = input.gestores ?? [];
  const orcamento = parseOrcamentoCsv(input.orcamentoCsv, ignoradas);
  const realizado = parseRealizadoCsv(input.realizadoCsv);
  const fluxo = parseFluxoMensalCsv(input.fluxoMensalCsv);
  const { projetos, soOrcamento, soRealizado } = buildProjetos(orcamento, realizado, gestores, ignoradas, fluxo);
  const now = new Date();
  return { projetos, gestores, linhasIgnoradas: ignoradas, projetosSoOrcamento: soOrcamento,
    projetosSoRealizado: soRealizado, dataBase: now.toLocaleDateString("pt-BR"), nomeArquivo,
    atualizadoEm: now.toLocaleString("pt-BR"), statusReportValores: input.statusReportValores ?? {},
    temFluxoMensalReal: fluxo.length > 0 };
}
