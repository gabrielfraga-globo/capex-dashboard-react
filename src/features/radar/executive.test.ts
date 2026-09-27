import { describe, it, expect } from "vitest";
import { buildProjectBalances, summarizeBalances, buildCurationConsistency, buildProjectsAtRisk, sumProvisioned } from "./executive";
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
});
