import { describe, it, expect } from "vitest";
import type { OperationalRow } from "../radar/operational";
import { buildBgVivo } from "../radar/executive";
import { explicarCompromissoExercicio, formatarDiaMes, fraseVirada } from "./compromissoExplicacao";

type Classif = OperationalRow["classification"];

const mkRow = (
  stage: string,
  classif: Classif,
  value: number,
  opts: { confirmed?: boolean; suggested?: string | null } = {},
): OperationalRow => ({
  rc: "RC",
  rubricas: [],
  projectName: "Projeto",
  n4: "",
  platformManager: null,
  supplier: "",
  priority: null,
  stage,
  value,
  lineCount: 1,
  ocCount: 0,
  daysInStage: null,
  subState: "",
  owner: "",
  ownerArea: "",
  tooltip: { statusRc: "", statusCompromisso: "", oc: "", comprador: "", dataPrometida: "" },
  forecast: null,
  forecastPaymentDate: null,
  suggestedPaymentDate: opts.suggested ?? null,
  isEarlyException: false,
  confidence: null,
  nextAction: null,
  isResidual: false,
  classification: classif,
  isClassificationConfirmed: opts.confirmed ?? false,
} as OperationalRow);

const cents = (n: number) => Math.round(n * 100);
const somaLinhas = (linhas: { valor: number }[]) => linhas.reduce((s, l) => s + cents(l.valor), 0);

const rows: OperationalRow[] = [
  mkRow("E2", "CAIXA_26", 100, { suggested: "2026-06-01" }),
  mkRow("E3", "CAIXA_26", 50, { confirmed: true }),
  mkRow("E4", "EM_RISCO", 30, { confirmed: true }), // confirmado, mas precedência = Em risco
  mkRow("E4", "EM_RISCO", 20),
  mkRow("E5", "CAIXA_27", 200, { suggested: "2027-03-10" }),
  mkRow("E2", "CAIXA_27", 70, { suggested: null }), // sem data prevista
  mkRow("E6", "CAIXA_27", 40, { confirmed: true }),
  mkRow("DESCONHECIDA", "CAIXA_26", 999, { suggested: "2026-02-01" }),
  mkRow("RESIDUAL", "CAIXA_27", 888, { suggested: "2027-02-01" }),
  mkRow("E1", "NAO_OCORRE", 5),
];

describe("explicarCompromissoExercicio", () => {
  it("Σ linhas === total no 26 e no 27", () => {
    const { c26, c27 } = explicarCompromissoExercicio(rows, 2026);
    expect(somaLinhas(c26.linhas)).toBe(cents(c26.total));
    expect(somaLinhas(c27.linhas)).toBe(cents(c27.total));
  });

  it("separa o 26 nas três partições com rótulos e quantidades", () => {
    const { c26 } = explicarCompromissoExercicio(rows, 2026);
    expect(c26.total).toBe(200);
    expect(c26.linhas).toEqual([
      { rotulo: "Em risco (incluído no 26)", valor: 50, qtd: 2 },
      { rotulo: "Decisão do gestor", valor: 50, qtd: 1 },
      { rotulo: "Pagamento estimado até 31/12", valor: 100, qtd: 1 },
    ]);
  });

  it("separa o 27 nas três partições com rótulos e quantidades", () => {
    const { c27 } = explicarCompromissoExercicio(rows, 2026);
    expect(c27.total).toBe(310);
    expect(c27.linhas).toEqual([
      { rotulo: "Decisão do gestor", valor: 40, qtd: 1 },
      { rotulo: "Sem data prevista", valor: 70, qtd: 1 },
      { rotulo: "Pagamento estimado após 31/12", valor: 200, qtd: 1 },
    ]);
  });

  it("EM_RISCO confirmado conta em 'Em risco', não em 'Decisão do gestor'", () => {
    const { c26 } = explicarCompromissoExercicio(
      [mkRow("E4", "EM_RISCO", 80, { confirmed: true })],
      2026,
    );
    expect(c26.linhas).toEqual([{ rotulo: "Em risco (incluído no 26)", valor: 80, qtd: 1 }]);
  });

  it("RC CAIXA_27 sem suggestedPaymentDate vai para 'Sem data prevista'", () => {
    const { c27 } = explicarCompromissoExercicio(
      [mkRow("E2", "CAIXA_27", 15, { suggested: null })],
      2026,
    );
    expect(c27.linhas).toEqual([{ rotulo: "Sem data prevista", valor: 15, qtd: 1 }]);
  });

  it("omite linhas com valor zero", () => {
    const { c26, c27 } = explicarCompromissoExercicio(
      [mkRow("E2", "CAIXA_26", 10, { suggested: "2026-06-01" })],
      2026,
    );
    expect(c26.linhas.map((l) => l.rotulo)).toEqual(["Pagamento estimado até 31/12"]);
    expect(c27.linhas).toEqual([]);
    expect(c27.total).toBe(0);
  });

  it("DESCONHECIDA e RESIDUAL ficam fora das duas partições", () => {
    const { c26, c27 } = explicarCompromissoExercicio(
      [
        mkRow("DESCONHECIDA", "CAIXA_26", 999),
        mkRow("RESIDUAL", "CAIXA_27", 888),
        mkRow("RESIDUAL", "EM_RISCO", 777),
      ],
      2026,
    );
    expect(c26.total).toBe(0);
    expect(c27.total).toBe(0);
  });

  it("total de cada cartão é igual ao valor que buildBgVivo devolve para a mesma entrada", () => {
    const { c26, c27 } = explicarCompromissoExercicio(rows, 2026);
    const v26 = buildBgVivo([], rows, 2026).emitido;
    const v27 = buildBgVivo([], rows, 2027).emitido;
    expect(cents(c26.total)).toBe(cents(v26));
    expect(cents(c27.total)).toBe(cents(v27));
  });
});

describe("formatarDiaMes", () => {
  it("usa a data local: 23h de 19/10 continua 19/10", () => {
    expect(formatarDiaMes(new Date(2026, 9, 19, 23, 0, 0))).toBe("19/10");
  });
});

describe("fraseVirada", () => {
  it("antes da virada: 19/10/2026 → 'a partir de 22/10'", () => {
    expect(fraseVirada(new Date(2026, 9, 19), 2026, 71)).toBe(
      "RCs em aprovação ou cotação usam hoje + 71 dias: a partir de 22/10 passam sozinhas para 2027.",
    );
  });
  it("dia da virada: 22/10/2026 → 'Desde 22/10'", () => {
    expect(fraseVirada(new Date(2026, 9, 22), 2026, 71)).toBe(
      "Desde 22/10, RCs em aprovação ou cotação entram em 2027 automaticamente (hoje + 71 dias).",
    );
  });
  it("fim de ano: 31/12/2026 → 'Desde 22/10'", () => {
    expect(fraseVirada(new Date(2026, 11, 31), 2026, 71)).toBe(
      "Desde 22/10, RCs em aprovação ou cotação entram em 2027 automaticamente (hoje + 71 dias).",
    );
  });
});
