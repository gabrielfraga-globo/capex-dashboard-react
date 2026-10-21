import { describe, it, expect } from "vitest";
import type { ProjetoBase } from "../types/index";
import type { OperationalRow } from "../features/radar/operational";
import { premissaSimples, premissaCompleta, projetoAtivo2026 } from "./metricas";

const mkProjeto = (nome: string, orc26: number, real26: number, emPag: number): ProjetoBase => ({
  id: nome, nome, n4: "", n4Curta: "",
  orcamentoPlurianual: 0, orcamento2026: orc26, orcamento2027: 0, h1_2026: 0, h2_2026: 0,
  realizado2026: real26, emPagamento2026: emPag, realizado2027: 0, emPagamento2027: 0,
  compromisso: 0,
  origemOrcamento: true, origemRealizado: true,
  gestor: null, gestorEmail: null, aprovador: null, meses2026: null, meses2027: null,
  aEmitirFonte: null, deltaCaixaFonte: null, executadoMensal2026: null,
  porRubrica: {},
} as ProjetoBase);

const mkLinha = (
  valueByProject: Record<string, number>,
  stage: string,
  classification: OperationalRow["classification"],
  extra: Partial<OperationalRow> = {}
): OperationalRow => {
  const value = Object.values(valueByProject).reduce((s, v) => s + v, 0);
  return {
    rc: `RC-${Math.random()}`, rubricas: [], projectName: Object.keys(valueByProject)[0], n4: "",
    platformManager: null, supplier: "", priority: null, stage, value, valueByProject,
    lineCount: 1, ocCount: 0, daysInStage: null, subState: stage, owner: "", ownerArea: "",
    tooltip: { statusRc: "", statusCompromisso: "", oc: "", comprador: "", dataPrometida: "" },
    forecast: null, forecastPaymentDate: null, suggestedPaymentDate: null, isEarlyException: false,
    confidence: null, nextAction: null, isResidual: false,
    classification, isClassificationConfirmed: false,
    ...extra,
  } as OperationalRow;
};

const projetos = [
  mkProjeto("Alfa", 1000, 300, 100),
  mkProjeto("Beta", 500, 100, 0),
  mkProjeto("Gama", 200, 0, 0),
];

const linhasBase: OperationalRow[] = [
  mkLinha({ Alfa: 400 }, "E1", "EM_RISCO"),
  mkLinha({ Alfa: 300 }, "E6", "CAIXA_26"),
  mkLinha({ Alfa: 500 }, "E2", "CAIXA_27"),
  mkLinha({ Beta: 350 }, "E4", "CAIXA_26", { subState: "E4_ATRASADO" }),
  mkLinha({ Beta: 200 }, "E5", "CAIXA_26"),
  mkLinha({ Gama: 150 }, "E3", "EM_RISCO"),
  mkLinha({ Gama: 999 }, "DESCONHECIDA", "CAIXA_26"),
  mkLinha({ Gama: 888 }, "RESIDUAL", "CAIXA_26"),
];

describe("projetoAtivo2026", () => {
  it("é ativo com orçamento, realizado ou em pagamento", () => {
    expect(projetoAtivo2026(mkProjeto("X", 10, 0, 0), [])).toBe(true);
    expect(projetoAtivo2026(mkProjeto("X", 0, 5, 0), [])).toBe(true);
    expect(projetoAtivo2026(mkProjeto("X", 0, 0, 5), [])).toBe(true);
  });

  it("é ativo com qualquer emissão elegível em 2026 (inclui CAIXA_27 automática)", () => {
    const p = mkProjeto("X", 0, 0, 0);
    expect(projetoAtivo2026(p, [mkLinha({ X: 10 }, "E6", "CAIXA_26")])).toBe(true);
    expect(projetoAtivo2026(p, [mkLinha({ X: 10 }, "E1", "EM_RISCO")])).toBe(true);
    expect(projetoAtivo2026(p, [mkLinha({ X: 10 }, "E6", "CAIXA_27")])).toBe(true);
    expect(projetoAtivo2026(p, [])).toBe(false);
  });

  it("não é ativo só com emissão excluída por decisão (CAIXA_27 confirmada ou NAO_OCORRE)", () => {
    const p = mkProjeto("X", 0, 0, 0);
    expect(projetoAtivo2026(p, [mkLinha({ X: 10 }, "E6", "CAIXA_27", { isClassificationConfirmed: true })])).toBe(false);
    expect(projetoAtivo2026(p, [mkLinha({ X: 10 }, "E6", "NAO_OCORRE")])).toBe(false);
  });

  it("não é ativo quando realizado e em pagamento se anulam e não há emissão (projetado 0 e plano 0)", () => {
    expect(projetoAtivo2026(mkProjeto("X", 0, 6550, -6550), [])).toBe(false);
    const p = mkProjeto("X", 0, 0, 0);
    expect(projetoAtivo2026(p, [mkLinha({ X: 10 }, "E6", "CAIXA_26"), mkLinha({ X: -10 }, "E6", "CAIXA_26")])).toBe(false);
  });
});

describe("premissaSimples — invariantes", () => {
  const r = premissaSimples(projetos, linhasBase);

  it("comprometido + excesso = elegível, por projeto e no total", () => {
    for (const p of r.projetos) {
      expect(p.comprometido + p.excesso).toBeCloseTo(p.elegivel, 6);
    }
    expect(r.total.comprometido + r.total.excesso).toBeCloseTo(r.total.elegivel, 6);
  });

  it("provisionado ≤ BG + Σexcesso (projetos sem estouro de BG)", () => {
    const sumExcesso = r.projetos.reduce((s, p) => s + p.excesso, 0);
    expect(r.total.provisionado).toBeLessThanOrEqual(r.total.bg + sumExcesso + 1e-6);
  });

  it("emRiscoSinal fica dentro do comprometido", () => {
    for (const p of r.projetos) {
      expect(p.emRiscoSinal).toBeLessThanOrEqual(p.comprometido + 1e-6);
    }
  });

  it("exclui DESCONHECIDA e RESIDUAL do elegível", () => {
    const gama = r.projetos.find((p) => p.projeto === "Gama")!;
    expect(gama.elegivel).toBe(150);
  });

  it("CAIXA_27 automática por data entra no elegível", () => {
    const alfa = r.projetos.find((p) => p.projeto === "Alfa")!;
    expect(alfa.elegivel).toBe(400 + 300 + 500);
  });
});

describe("premissaSimples — decisões e sem virada", () => {
  it("sem decisões, o elegível cobre CAIXA_26 + EM_RISCO + CAIXA_27 automática", () => {
    const simples = premissaSimples(projetos, linhasBase).total;
    const completa = premissaCompleta(projetos, linhasBase);
    expect(simples.elegivel).toBeGreaterThanOrEqual(completa.comp26);
    expect(simples.elegivel).toBeCloseTo(completa.comp26 + completa.comp27, 6);
  });

  it("uma decisão CAIXA_27 confirmada reduz o elegível e aparece em declarado27", () => {
    const antes = premissaSimples(projetos, linhasBase).total;
    const decidida = linhasBase.map((l) =>
      l.classification === "CAIXA_27" && l.projectName === "Alfa"
        ? { ...l, isClassificationConfirmed: true }
        : l
    );
    const depois = premissaSimples(projetos, decidida).total;
    expect(depois.elegivel).toBeCloseTo(antes.elegivel - 500, 6);
    expect(depois.declarado27).toBe(500);
    expect(antes.declarado27).toBe(0);
  });

  it("NAO_OCORRE confirmado sai do elegível (equivale a remover a linha)", () => {
    const antes = premissaSimples(projetos, linhasBase).total;
    const convertidas = linhasBase.map((l) =>
      l.projectName === "Beta" && l.classification === "CAIXA_26"
        ? { ...l, classification: "NAO_OCORRE" as const, isClassificationConfirmed: true }
        : l
    );
    const removidas = linhasBase.filter((l) => !(l.projectName === "Beta" && l.classification === "CAIXA_26"));
    const depois = premissaSimples(projetos, convertidas).total;
    expect(depois.elegivel).toBeLessThan(antes.elegivel);
    expect(depois.elegivel).toBeCloseTo(premissaSimples(projetos, removidas).total.elegivel, 6);
  });

  it("resultado não muda entre hoje e hoje+1 para RCs em E1–E3 (sem virada)", () => {
    const hoje = [
      mkLinha({ Alfa: 400 }, "E1", "EM_RISCO", { suggestedPaymentDate: "2026-12-01" }),
      mkLinha({ Beta: 150 }, "E2", "CAIXA_26", { suggestedPaymentDate: "2026-12-01" }),
    ];
    const amanha = [
      mkLinha({ Alfa: 400 }, "E1", "CAIXA_27", { suggestedPaymentDate: "2027-01-01" }),
      mkLinha({ Beta: 150 }, "E2", "CAIXA_27", { suggestedPaymentDate: "2027-01-01" }),
    ];
    expect(premissaSimples(projetos, amanha)).toEqual(premissaSimples(projetos, hoje));
  });
});
