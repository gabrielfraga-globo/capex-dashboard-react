import { describe, it, expect } from "vitest";
import { buildSaldoProjetosSection } from "./saldoProjetosCore.js";
import type { ProjetoBase } from "../types/index.js";
import { SALDO_COLUMNS } from "../features/saldo/saldoConfig.js";

type SaldoKey = keyof typeof SALDO_COLUMNS;
type Row = Partial<Record<SaldoKey, string>>;

const KEYS = Object.keys(SALDO_COLUMNS) as SaldoKey[];

const DEFAULTS: Record<SaldoKey, string> = {
  n4: "P1",
  aprovador: "Ap",
  nomeLB: "L1",
  ano: "2026",
  rubrica: "R1",
  orcamento: "100",
  caixa: "0",
  deltaCaixa: "0",
  compromissoTotal: "0",
  compromissoValido: "0",
  saldoDisponivel: "100",
  ultimaDataCompromisso: "",
  flagSaldo: "",
  saldoPotencial: "0",
  dataReferencia: "2026-10-18",
};

const GENERATED_AT = "2026-10-18T00:00:00.000Z";

function csvOf(rows: Row[], keys: SaldoKey[] = KEYS): string {
  const header = keys.map((key) => SALDO_COLUMNS[key]).join(";");
  const body = rows.map((row) => {
    const full = { ...DEFAULTS, ...row };
    return keys.map((key) => full[key]).join(";");
  });
  return [header, ...body].join("\n");
}

function build(csv: string, projetos: ProjetoBase[] = []) {
  return buildSaldoProjetosSection({ csv, projetos, generatedAt: GENERATED_AT });
}

const mkProjeto = (id: string, orc26: number, real26: number, emPag: number, comp: number): ProjetoBase => ({
  id, nome: id, n4: "", n4Curta: "",
  orcamentoPlurianual: 0, orcamento2026: orc26, orcamento2027: 0, h1_2026: 0, h2_2026: 0,
  realizado2026: real26, emPagamento2026: emPag, realizado2027: 0, emPagamento2027: 0,
  compromisso: comp,
  origemOrcamento: true, origemRealizado: true,
  gestor: null, gestorEmail: null, aprovador: null, meses2026: null, meses2027: null,
  aEmitirFonte: null, deltaCaixaFonte: null, executadoMensal2026: null,
  porRubrica: {}
});

describe("saldoProjetosCore.test.ts", () => {
  it("parses pt-BR numbers and loose date formats", () => {
    const csv = csvOf([
      { orcamento: "1.234,56", caixa: "-500,25", deltaCaixa: "", compromissoTotal: "abc", ultimaDataCompromisso: "2026-03-15" },
      { ultimaDataCompromisso: "2026-03-15 00:00:00" },
      { ultimaDataCompromisso: "2026-03-15 00:00:00,000" },
      { ultimaDataCompromisso: "15/03/2026" },
      { ultimaDataCompromisso: "31/02/2026" },
      { ultimaDataCompromisso: "" },
    ]);
    const { linhas } = build(csv);
    expect(linhas[0].orcamento).toBeCloseTo(1234.56);
    expect(linhas[0].caixa).toBeCloseTo(-500.25);
    expect(linhas[0].deltaCaixa).toBe(0);
    expect(linhas[0].compromissoTotal).toBe(0);
    expect(linhas.map((linha) => linha.ultimaDataCompromisso)).toEqual([
      "2026-03-15", "2026-03-15", "2026-03-15", "2026-03-15", null, null,
    ]);
  });

  it("throws on missing columns and on missing Data_Referencia", () => {
    const semCaixa = csvOf([{}], KEYS.filter((key) => key !== "caixa"));
    expect(() => build(semCaixa)).toThrow(/Realizado_Conecta_Ano/);
    expect(() => build(csvOf([{ dataReferencia: "" }]))).toThrow(/Data_Referencia/);
  });

  it("detects Saldo flag case-insensitively and discards lines without N4 or NomeLB", () => {
    const csv = csvOf([
      { flagSaldo: "✔️ Saldo" },
      { flagSaldo: "" },
      { flagSaldo: "SALDO", n4: "P2" },
      { n4: "" },
      { nomeLB: "", n4: "P3" },
      { ano: "2026.5", n4: "P4" },
    ]);
    const section = build(csv);
    expect(section.linhas.map((linha) => linha.flagSaldo)).toEqual([true, false, true]);
    expect(section.discardedLines).toBe(3);
  });

  it("builds projectKey, nulls and NAO_INFORMADA defaults", () => {
    const csv = csvOf([
      { n4: " Gnews  no Estúdio A ", nomeLB: " Lb ", aprovador: "", rubrica: "" },
    ]);
    const section = build(csv, [mkProjeto("gnews no estudio a|lb", 100, 0, 0, 0)]);
    const [linha] = section.linhas;
    expect(linha.projectKey).toBe("gnews no estudio a|lb");
    expect(linha.aprovador).toBeNull();
    expect(linha.rubrica).toBe("NAO_INFORMADA");
    expect(section.reconciliation.orphanProjects.count).toBe(0);
  });

  it("reports A_EMITIR_VALIDO identity errors and fails reconciliation", () => {
    const csv = csvOf([{ saldoDisponivel: "999" }]);
    const section = build(csv, [mkProjeto("p1|l1", 100, 0, 0, 0)]);
    expect(section.reconciliation.identityErrors).toHaveLength(1);
    expect(section.reconciliation.identityErrors[0]).toMatchObject({
      projectKey: "p1|l1",
      rule: "A_EMITIR_VALIDO",
      expected: 100,
      actual: 999,
    });
    expect(section.reconciliation.ok).toBe(false);
  });

  it("applies the VALOR_SALDO rule with the cut-off and flag", () => {
    const csv = csvOf([
      { flagSaldo: "Saldo Projeto", orcamento: "60000", saldoDisponivel: "60000", saldoPotencial: "60000" },
      { flagSaldo: "Saldo Projeto", orcamento: "40000", saldoDisponivel: "40000", saldoPotencial: "0" },
      { orcamento: "90000", saldoDisponivel: "90000", saldoPotencial: "0" },
      { flagSaldo: "Saldo Projeto", orcamento: "60000", saldoDisponivel: "60000", saldoPotencial: "0" },
    ]);
    const { reconciliation } = build(csv);
    expect(reconciliation.identityErrors).toHaveLength(1);
    expect(reconciliation.identityErrors[0]).toMatchObject({
      rule: "VALOR_SALDO",
      expected: 60000,
      actual: 0,
    });
  });

  it("flags the year guard when the source year differs from the reference year", () => {
    const csv = csvOf([{ ano: "2026", dataReferencia: "2027-01-05" }]);
    const { reconciliation } = build(csv);
    expect(reconciliation.yearGuard).toEqual({ ok: false, anosNaFonte: [2026], anoReferencia: 2027 });
    expect(reconciliation.ok).toBe(false);
  });

  it("applies check tolerance, and keeps compromisso as warning only", () => {
    const csvOrcamentoFora = csvOf([{ orcamento: "100", caixa: "0" }]);
    const projetosOrcamentoFora = [mkProjeto("p1|l1", 102, 0, 1, 0)];
    const fora = build(csvOrcamentoFora, projetosOrcamentoFora).reconciliation;
    expect(fora.checks.find((check) => check.label === "orcamento")?.ok).toBe(false);
    expect(fora.checks.find((check) => check.label === "caixa")?.ok).toBe(true);

    const csvCompromisso = csvOf([{ orcamento: "100", caixa: "0", compromissoTotal: "500" }]);
    const projetosCompromisso = [mkProjeto("p1|l1", 100, 0, 1, 0)];
    const warn = build(csvCompromisso, projetosCompromisso).reconciliation;
    expect(warn.warnings[0]).toMatchObject({ label: "compromisso", ok: false });
    expect(warn.checks.every((check) => check.ok)).toBe(true);
    expect(warn.ok).toBe(true);
  });

  it("lists orphan projects missing from the carteira", () => {
    const csv = csvOf([
      {},
      { n4: "P2", nomeLB: "L2", saldoDisponivel: "100" },
    ]);
    const { reconciliation } = build(csv, [mkProjeto("p1|l1", 100, 0, 0, 0)]);
    expect(reconciliation.orphanProjects).toEqual({
      count: 1,
      saldoDisponivel: 100,
      keys: ["p2|l2"],
    });
  });
});
