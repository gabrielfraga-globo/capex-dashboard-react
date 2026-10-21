import { describe, it, expect } from "vitest";
import type { ProjetoMetricas } from "../../types";
import type { OperationalRow } from "../radar/operational";
import { horizonte, simularBG, toleranciaDoPlano, triIgualAno, TOL_PCT_RITMO, type Horizonte } from "./simulador";

const REF = new Date(2026, 9, 20); // 20/10/2026
const EXERCICIO = 2026;

const mkProjeto = (parcial: Partial<ProjetoMetricas> & { nome: string }): ProjetoMetricas =>
  ({
    id: parcial.nome,
    n4: "",
    n4Curta: parcial.nome,
    gestor: "Gestor " + parcial.nome,
    gestorEmail: null,
    aprovador: null,
    orcamentoPlurianual: null,
    orcamento2026: null,
    orcamento2027: null,
    h1_2026: null,
    h2_2026: null,
    meses2026: null,
    meses2027: null,
    executadoMensal2026: null,
    realizado2026: 0,
    emPagamento2026: 0,
    realizado2027: null,
    emPagamento2027: null,
    compromisso: null,
    aEmitirFonte: null,
    deltaCaixaFonte: null,
    origemOrcamento: true,
    origemRealizado: true,
    porRubrica: {},
    ...parcial,
  }) as ProjetoMetricas;

const MES_1M = Array(12).fill(1_000_000) as number[];

const mkRow = (parcial: Partial<OperationalRow> & { projectName: string; value: number }): OperationalRow =>
  ({
    rc: "RC",
    rubricas: [],
    n4: "",
    platformManager: null,
    supplier: "",
    priority: null,
    stage: "E4",
    lineCount: 1,
    ocCount: 0,
    daysInStage: null,
    subState: "",
    owner: "",
    ownerArea: "",
    tooltip: { statusRc: "", statusCompromisso: "", oc: "", comprador: "", dataPrometida: "" },
    forecast: null,
    forecastPaymentDate: null,
    suggestedPaymentDate: null,
    isEarlyException: false,
    confidence: null,
    nextAction: null,
    isResidual: false,
    classification: "CAIXA_26",
    isClassificationConfirmed: false,
    ...parcial,
  }) as OperationalRow;

// Alfa: plano mensal 1M; executado 12M (ANTECIPANDO quando há +RCs)
// Beta: plano mensal 1M; executado 1M (POSTERGANDO)
// Gama: plano mensal 1M; executado 9M
// Delta: sem detalhe mensal, orçamento 12M (fallback proporcional); sem nenhuma RC
const projetos: ProjetoMetricas[] = [
  mkProjeto({ id: "alfa", nome: "Alfa", meses2026: MES_1M, orcamento2026: 12_000_000, realizado2026: 12_000_000 }),
  mkProjeto({ id: "beta", nome: "Beta", meses2026: MES_1M, orcamento2026: 12_000_000, realizado2026: 1_000_000 }),
  mkProjeto({ id: "gama", nome: "Gama", meses2026: MES_1M, orcamento2026: 12_000_000, realizado2026: 9_000_000 }),
  mkProjeto({ id: "delta", nome: "Delta", meses2026: null, orcamento2026: 12_000_000 }),
];

const rows: OperationalRow[] = [
  // R1 — Alfa, pagamento previsto dentro do fim do mês
  mkRow({ rc: "R1", projectName: "Alfa", value: 500_000, forecastPaymentDate: "2026-10-15" }),
  // R2 — Beta, pagamento depois do fim do mês (fica fora em "mes", entra em "tri")
  mkRow({ rc: "R2", projectName: "Beta", value: 700_000, forecastPaymentDate: "2026-11-05" }),
  // R3 — Gama, sem nenhuma data → semData
  mkRow({ rc: "R3", projectName: "Gama", value: 400_000 }),
  // R4 — repartida entre Alfa (200k, casa) e um projeto fora da lista (300k → órfã)
  mkRow({
    rc: "R4",
    projectName: "Alfa",
    value: 500_000,
    valueByProject: { Alfa: 200_000, "Projeto Inexistente": 300_000 },
    suggestedPaymentDate: "2026-09-01",
  }),
  // R5 — NAO_OCORRE: fora
  mkRow({ rc: "R5", projectName: "Beta", value: 50_000, classification: "NAO_OCORRE", suggestedPaymentDate: "2026-09-01" }),
  // R6 — CAIXA_27: fora
  mkRow({ rc: "R6", projectName: "Gama", value: 60_000, classification: "CAIXA_27", suggestedPaymentDate: "2026-09-01" }),
  // R7 — RESIDUAL: fora
  mkRow({ rc: "R7", projectName: "Delta", value: 70_000, stage: "RESIDUAL", suggestedPaymentDate: "2026-09-01" }),
  // R8 — DESCONHECIDA: fora
  mkRow({ rc: "R8", projectName: "Gama", value: 80_000, stage: "DESCONHECIDA", suggestedPaymentDate: "2026-09-01" }),
  // R9 — em risco, dentro do fim: entra só com incluirRisco
  mkRow({
    rc: "R9",
    projectName: "Gama",
    value: 100_000,
    classification: "EM_RISCO",
    suggestedPaymentDate: "2026-09-01",
  }),
];

const sim = (h: Horizonte, incluirRisco = true, ref: Date = REF) =>
  simularBG({ projetos, rows, h, ref, exerciseYear: EXERCICIO, incluirRisco });

const item = (s: ReturnType<typeof sim>, nome: string) => {
  const achado = s.itens.find((i) => i.nome === nome);
  if (!achado) throw new Error(`item ${nome} ausente`);
  return achado;
};

describe("horizonte", () => {
  it("hoje: meses fechados pela regra M-1 (out → 9) e fim = ref", () => {
    expect(horizonte("hoje", REF, EXERCICIO)).toMatchObject({ fim: "2026-10-20", mesesPlano: 9 });
  });

  it("hoje com ref em maio: 4 meses fechados", () => {
    expect(horizonte("hoje", new Date(2026, 4, 10), EXERCICIO)).toMatchObject({ fim: "2026-05-10", mesesPlano: 4 });
  });

  it("hoje em janeiro do exercício: nenhum mês fechado", () => {
    expect(horizonte("hoje", new Date(2026, 0, 5), EXERCICIO).mesesPlano).toBe(0);
  });

  it("mes: fim do mês de ref, mesesPlano = mês de ref", () => {
    expect(horizonte("mes", REF, EXERCICIO)).toMatchObject({ fim: "2026-10-31", mesesPlano: 10 });
  });

  it("mes em fevereiro bissexto respeita o último dia", () => {
    expect(horizonte("mes", new Date(2028, 1, 10), 2028)).toMatchObject({ fim: "2028-02-29", mesesPlano: 2 });
  });

  it("tri e ano com ref 20/10/2026 → 31/12, 12 meses", () => {
    expect(horizonte("tri", REF, EXERCICIO)).toMatchObject({ fim: "2026-12-31", mesesPlano: 12 });
    expect(horizonte("ano", REF, EXERCICIO)).toMatchObject({ fim: "2026-12-31", mesesPlano: 12 });
  });

  it("tri com ref 10/05/2026 → 30/06, 6 meses", () => {
    expect(horizonte("tri", new Date(2026, 4, 10), EXERCICIO)).toMatchObject({ fim: "2026-06-30", mesesPlano: 6 });
  });

  it("triIgualAno: true no 4º tri do ano; false no 2º tri", () => {
    expect(triIgualAno(REF, 2026)).toBe(true);
    expect(triIgualAno(new Date(2026, 4, 10), 2026)).toBe(false);
  });
});

describe("simularBG", () => {
  it("hoje: projetado = executado; RCs futuras não entram; semData/orfas zerados", () => {
    const s = sim("hoje");
    expect(item(s, "Alfa").projetado).toBe(12_000_000);
    expect(item(s, "Gama").projetado).toBe(9_000_000);
    expect(s.projetado).toBe(22_000_000);
    expect(s.plano).toBe(9_000_000 * 4);
    expect(s.semData).toEqual({ qtd: 0, valor: 0 });
    expect(s.orfas).toEqual({ qtd: 0, valor: 0 });
  });

  it("mes: projetado inclui RCs com data ≤ fim, RC com data > fim fica fora", () => {
    const s = sim("mes");
    expect(s.fim).toBe("2026-10-31");
    expect(s.plano).toBe(40_000_000);
    expect(item(s, "Alfa").projetado).toBeCloseTo(12_700_000, 2); // 12M + R1 0,5M + 0,2M da R4
    expect(item(s, "Beta").projetado).toBe(1_000_000); // R2 (11/2026) fora
    expect(item(s, "Gama").projetado).toBeCloseTo(9_100_000, 2); // 9M + R9 (em risco)
    expect(item(s, "Delta").projetado).toBe(0); // projeto sem RC
    expect(s.projetado).toBeCloseTo(22_800_000, 2);
  });

  it("tri: RC de novembro (R2) entra quando o fim passa a ser 31/12", () => {
    expect(item(sim("tri"), "Beta").projetado).toBe(1_700_000);
  });

  it("incluirRisco desligado: RC EM_RISCO sai do projetado", () => {
    const s = sim("mes", false);
    expect(item(s, "Gama").projetado).toBe(9_000_000);
    expect(s.projetado).toBeCloseTo(22_700_000, 2);
  });

  it("data nula → semData (fora do projetado)", () => {
    const s = sim("mes");
    expect(s.semData).toEqual({ qtd: 1, valor: 400_000 });
    expect(item(s, "Gama").projetado).toBeCloseTo(9_100_000, 2);
  });

  it("RC cujo projeto não casa com a lista → orfas, fora do projetado", () => {
    const s = sim("mes");
    expect(s.orfas).toEqual({ qtd: 1, valor: 300_000 });
  });

  it("órfã segue os mesmos filtros das elegíveis (estágio, classificação, risco, data)", () => {
    const orfa = (parcial: Partial<OperationalRow>) =>
      mkRow({ projectName: "Fora da lista", value: 10_000, suggestedPaymentDate: "2026-09-01", ...parcial });
    const s = simularBG({
      projetos,
      rows: [
        orfa({ rc: "A", stage: "RESIDUAL" }),
        orfa({ rc: "B", classification: "NAO_OCORRE" }),
        orfa({ rc: "C", classification: "CAIXA_27" }),
        orfa({ rc: "D", classification: "EM_RISCO" }),
        orfa({ rc: "E", suggestedPaymentDate: "2026-11-05" }),
        orfa({ rc: "F", suggestedPaymentDate: null }),
      ],
      h: "mes",
      ref: REF,
      exerciseYear: EXERCICIO,
      incluirRisco: false,
    });
    expect(s.orfas).toEqual({ qtd: 0, valor: 0 });

    const comRisco = simularBG({
      projetos,
      rows: [orfa({ rc: "D", classification: "EM_RISCO" })],
      h: "mes",
      ref: REF,
      exerciseYear: EXERCICIO,
      incluirRisco: true,
    });
    expect(comRisco.orfas).toEqual({ qtd: 1, valor: 10_000 });
  });

  it("NAO_OCORRE, CAIXA_27, RESIDUAL e DESCONHECIDA ficam fora em qualquer horizonte", () => {
    for (const h of ["mes", "tri", "ano"] as Horizonte[]) {
      const s = sim(h);
      expect(item(s, "Beta").projetado).toBe(h === "mes" ? 1_000_000 : 1_700_000);
      expect(item(s, "Gama").projetado).toBeCloseTo(9_100_000, 2);
      expect(item(s, "Delta").projetado).toBe(0);
    }
  });

  it("data exatamente igual ao fim entra no projetado", () => {
    const s = simularBG({
      projetos: [mkProjeto({ id: "x", nome: "X", meses2026: MES_1M, realizado2026: 0 })],
      rows: [mkRow({ projectName: "X", value: 123_000, forecastPaymentDate: "2026-10-31" })],
      h: "mes",
      ref: REF,
      exerciseYear: EXERCICIO,
      incluirRisco: true,
    });
    expect(s.itens[0].projetado).toBe(123_000);
  });

  it("status e grupos: tolerância = max(100k, 10% do plano)", () => {
    const s = sim("mes");
    expect(item(s, "Alfa")).toMatchObject({ plano: 10_000_000, status: "ANTECIPANDO" });
    expect(item(s, "Gama")).toMatchObject({ status: "NO_RITMO" }); // desvio −0,9M, tolerância 1M
    expect(item(s, "Beta")).toMatchObject({ status: "POSTERGANDO" });
    expect(item(s, "Delta")).toMatchObject({ status: "POSTERGANDO", plano: 10_000_000 });

    expect(s.grupos.noRitmo.qtd).toBe(1);
    expect(s.grupos.antecipando.qtd).toBe(1);
    expect(s.grupos.postergando.qtd).toBe(2);
    expect(s.grupos.noRitmo.desvio).toBeCloseTo(-900_000, 2);
    expect(s.grupos.antecipando.desvio).toBeCloseTo(2_700_000, 2);
    expect(s.grupos.postergando.desvio).toBeCloseTo(-19_000_000, 2);
  });

  it.each(["hoje", "mes", "tri", "ano"] as Horizonte[])(
    "identidade da ponte em %s: plano + Σ desvios dos grupos = projetado",
    (h) => {
      for (const incluirRisco of [true, false]) {
        const s = sim(h, incluirRisco);
        const somaDesvios = s.grupos.noRitmo.desvio + s.grupos.antecipando.desvio + s.grupos.postergando.desvio;
        expect(s.plano + somaDesvios).toBeCloseTo(s.projetado, 2);
        const qtd = s.grupos.noRitmo.qtd + s.grupos.antecipando.qtd + s.grupos.postergando.qtd;
        expect(qtd).toBe(projetos.length);
      }
    },
  );

  it("tolerância: piso de materialidade e proporção do plano", () => {
    expect(TOL_PCT_RITMO).toBe(0.1);
    expect(toleranciaDoPlano(0)).toBe(100_000);
    expect(toleranciaDoPlano(500_000)).toBe(100_000);
    expect(toleranciaDoPlano(10_000_000)).toBeCloseTo(1_000_000, 2);
  });
});
