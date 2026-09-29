import { describe, it, test, expect } from "vitest";
import { buildProjectBalances, summarizeBalances, buildCurationConsistency, buildProjectsAtRisk, sumProvisioned, buildBottleneck, buildInsights, buildBridge, monthsWindow, buildPlatformComposition, buildFlowSummary, classifyCriticality, buildRadarSummary, buildProgramProgress, aEmitirPorProjeto, buildBgVivo, buildDeltaCaixa } from "./executive";
import type { ProjetoBase } from "../../types/index";
import type { OperationalRow } from "./operational";

describe("executive.ts", () => {
  const dataBase = new Date("2026-09-27T00:00:00Z");

  const mkProjeto = (id: string, orc26: number, real26: number, emPag: number, comp: number): ProjetoBase => ({
    id, nome: id, n4: "", n4Curta: "",
    orcamentoPlurianual: 0, orcamento2026: orc26, orcamento2027: 0, h1_2026: 0, h2_2026: 0,
    realizado2026: real26, emPagamento2026: emPag, realizado2027: 0, emPagamento2027: 0,
    compromisso: comp,
    origemOrcamento: true, origemRealizado: true,
    gestor: null, gestorEmail: null, aprovador: null, meses2026: null, meses2027: null,
    aEmitirFonte: null, deltaCaixaFonte: null, executadoMensal2026: null
  });

  describe("buildProjectBalances", () => {
    it("classifies exactly 60 days as ATIVO_COM_SALDO and 61 as PARADO", () => {
      const p1 = mkProjeto("p1", 100, 0, 0, 0); // saldo 100
      const p2 = mkProjeto("p2", 100, 0, 0, 0); // saldo 100
      const activity = [
        { projectKey: "p1", lastPaymentAt: "2026-07-29", lastCommitmentCreatedAt: null, lastRcApprovedAt: null }, // exactly 60 days before Sep 27
        { projectKey: "p2", lastPaymentAt: "2026-07-28", lastCommitmentCreatedAt: null, lastRcApprovedAt: null }, // exactly 61 days before Sep 27
      ];
      const balances = buildProjectBalances([p1, p2], activity, dataBase);
      expect(balances.find(b => b.projectKey === "p1")?.group).toBe("ATIVO_COM_SALDO");
      expect(balances.find(b => b.projectKey === "p2")?.group).toBe("PARADO");
    });

    it("classifies missing activity as PARADO and counts in neverMoved", () => {
      const p1 = mkProjeto("p1", 100, 0, 0, 0);
      const balances = buildProjectBalances([p1], [], dataBase);
      expect(balances[0].group).toBe("PARADO");
      expect(balances[0].lastMovementAt).toBeNull();
      const summary = summarizeBalances(balances);
      expect(summary.parado.neverMoved).toBe(1);
    });

    it("treats null fields as 0 and excludes 0 saldo", () => {
      const p1 = mkProjeto("p1", 100, 100, 0, 0); // saldo 0
      const balances = buildProjectBalances([p1], [], dataBase);
      expect(balances.length).toBe(0);
    });

    it("classifies negative saldo as ACIMA_BG", () => {
      const p1 = mkProjeto("p1", 100, 120, 0, 0); // saldo -20
      const balances = buildProjectBalances([p1], [], dataBase);
      expect(balances[0].group).toBe("ACIMA_BG");
    });
    
    it("uses the most recent date for lastMovementType", () => {
      const p1 = mkProjeto("p1", 100, 0, 0, 0);
      const activity = [
        { projectKey: "p1", lastPaymentAt: "2026-07-20", lastCommitmentCreatedAt: "2026-08-10", lastRcApprovedAt: "2026-08-01" },
      ];
      const balances = buildProjectBalances([p1], activity, dataBase);
      expect(balances[0].lastMovementAt).toBe("2026-08-10");
      expect(balances[0].lastMovementType).toBe("COMPROMISSO");
    });
  });

  describe("buildCurationConsistency", () => {
    it("pareto scope includes the row that crosses 80%", () => {
      const rows: any[] = [
        { value: 50, stage: 'E1', classification: 'CAIXA_26', isClassificationConfirmed: false, expectedDeliveryDate: null },
        { value: 30, stage: 'E1', classification: 'CAIXA_26', isClassificationConfirmed: false, expectedDeliveryDate: null },
        { value: 20, stage: 'E1', classification: 'CAIXA_26', isClassificationConfirmed: false, expectedDeliveryDate: null },
      ];
      // Total 100. 80% = 80.
      // row 1: 50 -> scopeValue = 50 (not >= 80 yet)
      // row 2: 30 -> scopeValue = 80 (>= 80, breaks after)
      // so it should include exactly 2 rows.
      const res = buildCurationConsistency(rows as OperationalRow[], dataBase, 2026);
      expect(res.scopeCount).toBe(2);
      expect(res.scopeValue).toBe(80);
    });

    it("counts expired based on expected date", () => {
      const rows: any[] = [
        { value: 100, stage: 'E1', classification: 'CAIXA_26', isClassificationConfirmed: true, forecastPaymentDate: '2026-09-26' }, // expired
        { value: 50, stage: 'E1', classification: 'CAIXA_26', isClassificationConfirmed: true, forecastPaymentDate: '2026-09-28' }, // not expired
        { value: 20, stage: 'E1', classification: 'CAIXA_26', isClassificationConfirmed: false, forecastPaymentDate: '2026-09-26' }, // ignored because not confirmed
        { value: 10, stage: 'E1', classification: 'NAO_OCORRE', isClassificationConfirmed: true, forecastPaymentDate: '2026-09-26' }, // ignored because NAO_OCORRE
      ];
      const res = buildCurationConsistency(rows as OperationalRow[], dataBase, 2026);
      expect(res.expired).toBe(1);
    });
  });
  describe("sumProvisioned e buildProjectsAtRisk", () => {
    const rows: any[] = [
      { rc: "A", projectName: "P1", n4: "N", platformManager: "G", value: 100, stage: "E2", classification: "EM_RISCO", isClassificationConfirmed: false },
      { rc: "B", projectName: "P1", n4: "N", platformManager: "G", value: 40, stage: "E2", classification: "CAIXA_26", isClassificationConfirmed: true }, // sugestão seria EM_RISCO, gestor decidiu Caixa 26
      { rc: "C", projectName: "P2", n4: "N", platformManager: "G", value: 30, stage: "E5", classification: "CAIXA_27", isClassificationConfirmed: false },
      { rc: "D", projectName: "P3", n4: "N", platformManager: "G", value: 999, stage: "RESIDUAL", classification: "CAIXA_27", isClassificationConfirmed: false },
      { rc: "E", projectName: "P3", n4: "N", platformManager: "G", value: 888, stage: "RESIDUAL", classification: "EM_RISCO", isClassificationConfirmed: false },
    ];

    it("exclui RESIDUAL das somas de provisionado", () => {
      expect(sumProvisioned(rows as OperationalRow[])).toEqual({ prov26: 40, provRisco: 100, prov27: 30 });
    });

    it("usa a classificação efetiva: RC decidida como Caixa 26 sai do risco", () => {
      const res = buildProjectsAtRisk(rows as OperationalRow[]);
      expect(res.count).toBe(1);
      expect(res.projects[0]).toMatchObject({ projectName: "P1", rcCount: 1, value: 100 });
      expect(res.totalValue).toBe(100);
    });
  });

  describe("buildBottleneck", () => {
    it("groups and orders by value", () => {
      const mkCustom = (val: number, classif: string, stage: string, owner: string): OperationalRow => ({
        rc: "rc", projectName: "p", n4: "n4", platformManager: owner, supplier: "s", priority: null,
        stage, value: val, lineCount: 1, ocCount: 1, daysInStage: null, subState: "", owner, ownerArea: owner, tooltip: { statusRc: "", statusCompromisso: "", oc: "", comprador: "", dataPrometida: "" },
        forecast: null, forecastPaymentDate: null, suggestedPaymentDate: null, isEarlyException: false, confidence: null, nextAction: null, isResidual: false,
        classification: classif as any, isClassificationConfirmed: false
      });
      const rows = [
        mkCustom(200, "EM_RISCO", "S1", "O1"),
        mkCustom(300, "EM_RISCO", "S1", "O1"),
        mkCustom(100, "EM_RISCO", "S2", "O1"),
      ];
      const bot = buildBottleneck(rows);
      expect(bot.length).toBe(2);
      expect(bot[0].value).toBe(500);
      expect(bot[0].stage).toBe("S1");
      expect(bot[0].area).toBe("O1");
      expect(bot[1].value).toBe(100);
    });
  });

  describe("buildInsights", () => {
    it("generates resumo and respects materiality for risco", () => {
      const db = new Date("2026-09-27T00:00:00Z"); // month = 8, 9 elapsed, 3 left
      const input = {
        bgSistemico: 10_000_000,
        projetado: 9_000_000,
        realizado: 4_500_000,
        emPagamento: 500_000,
        projetosEmRiscoCount: 1,
        projetosEmRiscoValue: 50_000,
        top10RiscoValue: 50_000,
        dataBase: db,
        opRows: [
          {
            rc: "rc1", projectName: "p1", n4: "n4", platformManager: "O1", supplier: "s", priority: null,
            stage: "S1", value: 50_000, lineCount: 1, ocCount: 1, daysInStage: null, subState: "", owner: "O1", ownerArea: "O1", tooltip: { statusRc: "", statusCompromisso: "", oc: "", comprador: "", dataPrometida: "" },
            forecast: null, forecastPaymentDate: null, suggestedPaymentDate: null, isEarlyException: false, confidence: null, nextAction: null, isResidual: false,
            classification: "EM_RISCO", isClassificationConfirmed: false
          }
        ] as OperationalRow[],
        saldoParadoValue: 0,
        curadoriaPendenteValue: 0
      };
      
      const insights = buildInsights(input);
      expect(insights[0].kind).toBe("resumo");
      expect(insights[0].text).toContain("9,0M (90% do BG)");
      
      // Risco 50k is not material (not >= 1M, and gap is 1M, 5% is 50k, wait, 50k is 5% so it IS material)
      // Let's change gap so it's not material
      input.bgSistemico = 15_000_000; // gap = 6M. 5% = 300k
      const insights2 = buildInsights(input);
      expect(insights2.find((i: any) => i.kind === "risco")).toBeUndefined();
    });

    it("evaluates trend crit/warn", () => {
      const db = new Date("2026-09-27T00:00:00Z"); // 9 elapsed, 3 left
      const input = {
        bgSistemico: 12_000_000,
        projetado: 12_000_000,
        realizado: 900_000,
        emPagamento: 0,
        projetosEmRiscoCount: 0,
        projetosEmRiscoValue: 0,
        top10RiscoValue: 0,
        dataBase: db,
        opRows: [] as OperationalRow[],
        saldoParadoValue: 0,
        curadoriaPendenteValue: 0
      };
      // media = 900k / 9 = 100k
      // gap = 12M - 900k = 11.1M. necessario = 11.1M / 3 = 3.7M
      // > 2x media -> crit
      const insights = buildInsights(input);
      const tend = insights.find((i: any) => i.kind === "tendencia");
      expect(tend?.severity).toBe("crit");
    });
  });
});

describe("monthsWindow e buildBridge", () => {
  it("setembro: 9 meses decorridos, 3 restantes; dezembro: 1 restante", () => {
    expect(monthsWindow(new Date(2026, 8, 25))).toEqual({ elapsed: 9, left: 3 });
    expect(monthsWindow(new Date(2026, 11, 10))).toEqual({ elapsed: 12, left: 1 });
  });

  it("a ponte fecha quando as bases batem e expõe a diferença quando não batem", () => {
    const base = { bg: 145.5, realizado: 72.4, emPagamento: 8.2, prov26: 21.2, provRisco: 30.1, prov27: 2.1, residual: 2.8, saldoLiquido: 8.7 };
    const ok = buildBridge({ ...base, bg: 72.4 + 8.2 + 21.2 + 30.1 + 2.1 + 2.8 + 8.7 });
    expect(Math.abs(ok.diferenca)).toBeLessThan(1e-9);
    expect(ok.steps.find(s => s.kind === "diff")).toBeUndefined();
    const off = buildBridge({ ...base, bg: 72.4 + 8.2 + 21.2 + 30.1 + 2.1 + 2.8 + 8.7 + 50_000 });
    expect(off.steps.find(s => s.kind === "diff")?.value).toBeCloseTo(50_000);
    expect(off.steps.at(-1)?.kind).toBe("result");
  });

  it("gargalo agrupa por área, sem o nome da pessoa, e ignora residuais", () => {
    const r = (v: number, stage: string, owner: string, area: string) => ({ value: v, stage, owner, ownerArea: area, classification: "EM_RISCO" }) as unknown as OperationalRow;
    const bot = buildBottleneck([r(100, "E2", "Ana · Suprimentos", "Suprimentos"), r(200, "E2", "Bia · Suprimentos", "Suprimentos"), r(999, "RESIDUAL", "x", "Suprimentos")]);
    expect(bot).toEqual([{ stage: "E2", area: "Suprimentos", value: 300, rcCount: 2 }]);
  });
});

describe("buildPlatformComposition", () => {
  it("retorna top 4 + Outras, ordenados desc por valor", () => {
    const lista = [
      { n4Curta: "A", orcamento2026: 100 },
      { n4Curta: "A", orcamento2026: 50 },
      { n4Curta: "B", orcamento2026: 200 },
      { n4Curta: "C", orcamento2026: 30 },
      { n4Curta: "D", orcamento2026: 20 },
      { n4Curta: "E", orcamento2026: 10 },
    ] as any[];
    const { rows, total } = buildPlatformComposition(lista, 4);
    expect(total).toBe(410);
    expect(rows[0]).toMatchObject({ label: "B", value: 200, isOther: false });
    expect(rows[1]).toMatchObject({ label: "A", value: 150, isOther: false });
    expect(rows.at(-1)).toMatchObject({ label: "Outras", isOther: true, value: 10 });
    expect(rows.every(r => Math.abs(r.pct - r.value / total) < 1e-9)).toBe(true);
  });

  it("quando há <= topN plataformas, não gera linha Outras", () => {
    const lista = [{ n4Curta: "X", orcamento2026: 100 }] as any[];
    const { rows } = buildPlatformComposition(lista, 4);
    expect(rows.find(r => r.isOther)).toBeUndefined();
  });
});

describe("buildFlowSummary", () => {
  it("soma executadoAcumulado e planejadoAcumulado e calcula desvio", () => {
    const lista = [
      { executadoAcumulado: 80, planejadoAcumulado: 100 },
      { executadoAcumulado: 60, planejadoAcumulado: 50 },
    ] as any[];
    const s = buildFlowSummary(lista);
    expect(s.realizadoAcumulado).toBe(140);
    expect(s.planejadoAcumulado).toBe(150);
    expect(s.desvio).toBeCloseTo(-10);
    expect(s.desvioRel).toBeCloseTo(-10 / 150);
  });

  it("cai para realizadoAcumulado quando executadoAcumulado ausente", () => {
    const lista = [{ realizadoAcumulado: 50, planejadoAcumulado: 60 }] as any[];
    const s = buildFlowSummary(lista);
    expect(s.realizadoAcumulado).toBe(50);
  });
});

describe("classifyCriticality e buildRadarSummary", () => {
  const db = new Date("2026-09-30T00:00:00Z");

  it("classifica EM_RISCO >= 1M como CRITICO e < 1M como ATENCAO", () => {
    const r1 = { stage: "E2", classification: "EM_RISCO", value: 1_000_000 } as OperationalRow;
    const r2 = { stage: "E2", classification: "EM_RISCO", value: 999_999 } as OperationalRow;
    expect(classifyCriticality(r1, db)).toBe("CRITICO");
    expect(classifyCriticality(r2, db)).toBe("ATENCAO");
  });

  it("classifica RC confirmada vencida como CRITICO (mesmo não sendo EM_RISCO)", () => {
    const r = { stage: "E2", classification: "CAIXA_26", isClassificationConfirmed: true, forecastPaymentDate: "2026-09-15", value: 100 } as OperationalRow;
    expect(classifyCriticality(r, db)).toBe("CRITICO");
  });

  it("não classifica como CRITICO se data vencida não estiver confirmada", () => {
    const r = { stage: "E2", classification: "CAIXA_26", isClassificationConfirmed: false, forecastPaymentDate: "2026-09-15", value: 100 } as OperationalRow;
    expect(classifyCriticality(r, db)).toBe("NORMAL"); // not confirmed, not EM_RISCO
  });

  it("classifica CAIXA_27 não confirmada como ATENCAO, e confirmada como NORMAL", () => {
    const rN = { stage: "E2", classification: "CAIXA_27", isClassificationConfirmed: false, forecastPaymentDate: "2027-01-10", value: 100 } as OperationalRow;
    const rC = { stage: "E2", classification: "CAIXA_27", isClassificationConfirmed: true, forecastPaymentDate: "2027-01-10", value: 100 } as OperationalRow;
    expect(classifyCriticality(rN, db)).toBe("ATENCAO");
    expect(classifyCriticality(rC, db)).toBe("NORMAL");
  });

  it("classifica RESIDUAL/DESCONHECIDA sempre como NORMAL, ignorando regras", () => {
    const r = { stage: "RESIDUAL", classification: "EM_RISCO", value: 2_000_000 } as OperationalRow;
    expect(classifyCriticality(r, db)).toBe("NORMAL");
  });

  it("buildRadarSummary computa impacto, rcs, gargalo pctImpacto, e criticidade", () => {
    // 2 EM_RISCO, 1 CAIXA_27
    const r1 = { stage: "E2", ownerArea: "A", classification: "EM_RISCO", value: 1_000_000, isClassificationConfirmed: false } as OperationalRow;
    const r2 = { stage: "E2", ownerArea: "A", classification: "EM_RISCO", value: 400_000, isClassificationConfirmed: false } as OperationalRow;
    const r3 = { stage: "E3", ownerArea: "B", classification: "CAIXA_27", value: 600_000, isClassificationConfirmed: false } as OperationalRow;
    
    const sum = buildRadarSummary([r1, r2, r3], 10_000_000, db);
    
    // Impacto: provRisco (1.4M) + prov27 (0.6M) = 2.0M
    expect(sum.impacto.value).toBe(2_000_000);
    expect(sum.impacto.pctBg).toBe(0.2);

    expect(sum.rcs).toEqual({ emRisco: 2, caixa27: 1, confirmadas: 0 });
    
    // Gargalo: E2 (A) com 1.4M
    expect(sum.gargalo?.stage).toBe("E2");
    expect(sum.gargalo?.pctImpacto).toBe(1); // 1.4M / 1.4M

    expect(sum.criticidade.critico).toEqual({ count: 1, value: 1_000_000 });
    expect(sum.criticidade.atencao).toEqual({ count: 2, value: 1_000_000 }); // r2 e r3
    expect(sum.criticidade.normal).toEqual({ count: 0, value: 0 });
  });
});

describe("executive / buildProgramProgress", () => {
  test("calculates progress and risk by n4Curta", () => {
    const lista = [
      { id: "p1", nome: "Proj 1", n4Curta: "Tec", orcamento2026: 100, realizado2026: 20, emPagamento2026: 10 },
      { id: "p2", nome: "Proj 2", n4Curta: "Tec", orcamento2026: 50, realizado2026: 50, emPagamento2026: 0 },
      { id: "p3", nome: "Proj 3", n4Curta: "Ops", orcamento2026: 200, realizado2026: 50, emPagamento2026: 50 }
    ] as ProjetoBase[];

    const opRows = [
      { projectName: "Proj 1", stage: "E1", classification: "EM_RISCO", value: 15 },
      { projectName: "Proj 2", stage: "E1", classification: "EM_RISCO", value: 5 },
      { projectName: "Proj 3", stage: "E1", classification: "CAIXA_26", value: 100 }
    ] as OperationalRow[];

    const { rows, total } = buildProgramProgress(lista, opRows);

    expect(rows).toHaveLength(2);
    
    const tec = rows.find(r => r.label === "Tec")!;
    expect(tec.orcamento).toBe(150);
    expect(tec.executado).toBe(80); // 20+10 + 50+0
    expect(tec.risco).toBe(20); // 15 + 5
    expect(tec.pct).toBe(80 / 150);

    const ops = rows.find(r => r.label === "Ops")!;
    expect(ops.orcamento).toBe(200);
    expect(ops.executado).toBe(100);
    expect(ops.risco).toBe(0);
    
    expect(total.orcamento).toBe(350);
    expect(total.executado).toBe(180);
    expect(total.risco).toBe(20);
  });
});

describe("executive / novas funções iteração 7", () => {
  const mkProjeto = (id: string, orc26: number, real26: number, emPag: number, comp: number, orc27: number = 0): ProjetoBase => ({
    id, nome: `Projeto ${id}`, n4: "", n4Curta: "",
    orcamentoPlurianual: 0, orcamento2026: orc26, orcamento2027: orc27, h1_2026: 0, h2_2026: 0,
    realizado2026: real26, emPagamento2026: emPag, realizado2027: 0, emPagamento2027: 0,
    compromisso: comp,
    origemOrcamento: true, origemRealizado: true,
    gestor: null, gestorEmail: null, aprovador: null, meses2026: null, meses2027: null,
    aEmitirFonte: null, deltaCaixaFonte: null, executadoMensal2026: null
  });

  const mkOpRow = (proj: string, stage: string, classif: string, val: number): OperationalRow => ({
    rc: "123", projectName: `Projeto ${proj}`, n4: "", platformManager: null, supplier: "", priority: null,
    stage, value: val, lineCount: 1, ocCount: 0, daysInStage: null, subState: "", owner: "", ownerArea: "",
    tooltip: { statusRc: "", statusCompromisso: "", oc: "", comprador: "", dataPrometida: "" },
    forecast: null, forecastPaymentDate: null, suggestedPaymentDate: null, isEarlyException: false,
    confidence: null, nextAction: null, isResidual: false, classification: classif as any, isClassificationConfirmed: false
  });

  describe("aEmitirPorProjeto", () => {
    it("calcula para 2026 ignorando projetos negativos", () => {
      const p1 = mkProjeto("1", 100, 20, 10, 50); // a emitir = 20
      const p2 = mkProjeto("2", 100, 50, 50, 50); // negativo (-50), vira 0
      expect(aEmitirPorProjeto([p1, p2], [], 2026)).toBe(20);
    });

    it("calcula para 2027 extraindo compromissos CAIXA_27", () => {
      const p1 = mkProjeto("1", 0, 0, 0, 100, 200); // 2027 bg: 200
      const r1 = mkOpRow("1", "E2", "CAIXA_27", 80);
      const r2 = mkOpRow("1", "E3", "CAIXA_27", 30);
      const r3 = mkOpRow("1", "E4", "EM_RISCO", 50); // ignorado (não é CAIXA_27)
      expect(aEmitirPorProjeto([p1], [r1, r2, r3], 2027)).toBe(90); // 200 - 110 = 90
    });
  });

  describe("buildBgVivo", () => {
    it("monta o BG Vivo 2026 separando emRisco (incluído no vivo)", () => {
      const p1 = mkProjeto("1", 1000, 200, 50, 300); // BG 1000, real 200, empag 50. a emitir = 450
      const r1 = mkOpRow("1", "E2", "CAIXA_26", 200);
      const r2 = mkOpRow("1", "E3", "EM_RISCO", 100); // em risco conta como emitido 2026

      const vivo = buildBgVivo([p1], [r1, r2], 2026);
      expect(vivo.bgGov).toBe(1000);
      expect(vivo.realizado).toBe(200);
      expect(vivo.emPagamento).toBe(50);
      expect(vivo.emitido).toBe(300); // 200 + 100
      expect(vivo.emRisco).toBe(100);
      expect(vivo.aEmitir).toBe(450); // 1000 - 200 - 50 - 300 = 450
      expect(vivo.bgVivo).toBe(200 + 50 + 300 + 450); // 1000
    });

    it("monta o BG Vivo 2027 com aEmitir nao ficando negativo", () => {
      const p1 = mkProjeto("1", 0, 0, 0, 0, 500); // BG 500
      const r1 = mkOpRow("1", "E2", "CAIXA_27", 600); // Estourou 2027 em 100
      
      const vivo = buildBgVivo([p1], [r1], 2027);
      expect(vivo.bgGov).toBe(500);
      expect(vivo.emitido).toBe(600);
      expect(vivo.aEmitir).toBe(0);
      expect(vivo.bgVivo).toBe(600); // bgVivo com projeto acima do BG
      expect(vivo.diferencaVsGov).toBe(100);
    });
  });

  describe("buildDeltaCaixa", () => {
    it("calcula bg - (realizado + em pagamento)", () => {
      const p1 = mkProjeto("1", 1000, 300, 50, 0);
      const p2 = mkProjeto("2", 500, 0, 100, 0);
      expect(buildDeltaCaixa([p1, p2])).toBe(1500 - (300 + 50) - 100); // 1500 - 450 = 1050
    });
  });
});
