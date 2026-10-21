import { describe, it, expect } from "vitest";
import type { ProjetoBase } from "../types/index";
import type { OperationalRow } from "../features/radar/operational";
import { premissaSimples } from "./metricas";
import { resumoPorRubrica } from "./rubricaPlanejadoRealizado";

const dR = (meses: number[]) => ({ meses2026: meses, realizado2026: 0 });

const mkProjeto = (nome: string, porRubrica: Record<string, { meses2026: number[]; realizado2026: number }>): ProjetoBase => ({
  id: nome, nome, n4: "", n4Curta: "",
  orcamentoPlurianual: 0, orcamento2026: 0, orcamento2027: 0, h1_2026: 0, h2_2026: 0,
  realizado2026: 0, emPagamento2026: 0, realizado2027: 0, emPagamento2027: 0,
  compromisso: 0,
  origemOrcamento: true, origemRealizado: true,
  gestor: null, gestorEmail: null, aprovador: null, meses2026: null, meses2027: null,
  aEmitirFonte: null, deltaCaixaFonte: null, executadoMensal2026: null,
  porRubrica: porRubrica as unknown as ProjetoBase["porRubrica"],
} as ProjetoBase);

const mkLinha = (
  valueByProject: Record<string, number>,
  valueByRubrica: Record<string, number>,
  stage: string,
  classification: OperationalRow["classification"],
  extra: Partial<OperationalRow> = {}
): OperationalRow => {
  const value = Object.values(valueByProject).reduce((s, v) => s + v, 0);
  return {
    rc: `RC-${Math.random()}`, rubricas: Object.keys(valueByRubrica), projectName: Object.keys(valueByProject)[0],
    n4: "", platformManager: null, supplier: "", priority: null, stage, value, valueByProject, valueByRubrica,
    lineCount: 1, ocCount: 0, daysInStage: null, subState: stage, owner: "", ownerArea: "",
    tooltip: { statusRc: "", statusCompromisso: "", oc: "", comprador: "", dataPrometida: "" },
    forecast: null, forecastPaymentDate: null, suggestedPaymentDate: null, isEarlyException: false,
    confidence: null, nextAction: null, isResidual: false,
    classification, isClassificationConfirmed: false,
    ...extra,
  } as OperationalRow;
};

const projetos = [
  mkProjeto("Alfa", { SOLUCAO: dR([0]), MDO: dR([0]) }),
  mkProjeto("Beta", { SOLUCAO: dR([0]), INSTALACAO: dR([0]) }),
];

const linhas: OperationalRow[] = [
  mkLinha({ Alfa: 400 }, { SOLUCAO: 300, MDO: 100 }, "E1", "EM_RISCO"),
  mkLinha({ Alfa: 300 }, { SOLUCAO: 300 }, "E6", "CAIXA_26"),
  mkLinha({ Alfa: 500 }, { SOLUCAO: 500 }, "E2", "CAIXA_27"),
  mkLinha({ Beta: 350 }, { INSTALACAO: 350 }, "E4", "CAIXA_26", { subState: "E4_ATRASADO" }),
  mkLinha({ Beta: 200 }, { SOLUCAO: 200 }, "E5", "CAIXA_26"),
  mkLinha({ Beta: 150 }, { INSTALACAO: 150 }, "E3", "EM_RISCO"),
  mkLinha({ Beta: 999 }, { SOLUCAO: 999 }, "DESCONHECIDA", "CAIXA_26"),
  mkLinha({ Beta: 888 }, { MDO: 888 }, "RESIDUAL", "CAIXA_26"),
  mkLinha({ Alfa: 120 }, { MDO: 120 }, "E6", "NAO_OCORRE", { isClassificationConfirmed: true }),
  mkLinha({ Alfa: 80 }, { MDO: 80 }, "E6", "CAIXA_27", { isClassificationConfirmed: true }),
];

const soma = (rs: { comprometido: number }[]) => rs.reduce((s, r) => s + r.comprometido, 0);

describe("resumoPorRubrica — conciliação do comprometido", () => {
  it("Σ comprometido por rubrica bate com premissaSimples(...).total.elegivel", () => {
    const resumo = resumoPorRubrica({ projetos, linhas, rubricas: [], mesesPlanejados: 9 });
    const elegivel = premissaSimples(projetos, linhas).total.elegivel;
    expect(soma(resumo)).toBeCloseTo(elegivel, 6);
  });

  it("exclui CAIXA_27 confirmada, NAO_OCORRE, DESCONHECIDA e RESIDUAL do comprometido", () => {
    const resumo = resumoPorRubrica({ projetos, linhas, rubricas: [], mesesPlanejados: 9 });
    const porRubrica = Object.fromEntries(resumo.map((r) => [r.rubrica, r.comprometido]));
    // CAIXA_27 não confirmada entra (automática); só as confirmadas saem.
    expect(porRubrica.SOLUÇÃO ?? porRubrica.SOLUCAO).toBeCloseTo(300 + 300 + 500 + 200, 6);
    expect(porRubrica.MDO).toBeCloseTo(100, 6);
    expect(porRubrica.INSTALAÇÃO ?? porRubrica.INSTALACAO).toBeCloseTo(350 + 150, 6);
  });

  it("filtro de rubrica preserva a conciliação da rubrica escolhida", () => {
    const resumo = resumoPorRubrica({ projetos, linhas, rubricas: ["MDO"], mesesPlanejados: 9 });
    expect(resumo.map((r) => r.rubrica)).toEqual(["MDO"]);
    expect(soma(resumo)).toBeCloseTo(100, 6);
  });
});
