import { describe, it, expect } from "vitest";
import { displayStage, directorateOf, buildStageCounters, buildDirectorateBreakdown } from "./esteira";

describe("esteira.ts", () => {
  describe("displayStage", () => {
    it("returns NEGOCIACAO for INCOMPLETE with or without OC", () => {
      expect(displayStage({ stage: "E3", tooltip: { statusCompromisso: "INCOMPLETE" } })).toBe("NEGOCIACAO");
      expect(displayStage({ stage: "E1", tooltip: { statusCompromisso: "INCOMPLETE" } })).toBe("NEGOCIACAO");
    });

    it("returns null for CANCELLED", () => {
      expect(displayStage({ stage: "E2", tooltip: { statusCompromisso: "CANCELLED" } })).toBeNull();
    });

    it("maps internal stages correctly", () => {
      expect(displayStage({ stage: "E0" })).toBe("A_EMITIR");
      expect(displayStage({ stage: "E1" })).toBe("RC_APROVACAO");
      expect(displayStage({ stage: "E2" })).toBe("NEGOCIACAO");
      expect(displayStage({ stage: "E3" })).toBe("OC_APROVACAO");
      expect(displayStage({ stage: "E4" })).toBe("AGUARDANDO");
      expect(displayStage({ stage: "E5" })).toBe("AGUARDANDO");
      expect(displayStage({ stage: "E6" })).toBe("AGUARDANDO");
      expect(displayStage({ stage: "E7" })).toBe("EM_PAGAMENTO");
      expect(displayStage({ stage: "DESCONHECIDA" })).toBeNull();
    });
  });

  describe("directorateOf", () => {
    it("maps to correct directorate", () => {
      expect(directorateOf("A_EMITIR")).toBe("Tecnologia");
      expect(directorateOf("RC_APROVACAO")).toBe("Tecnologia");
      expect(directorateOf("NEGOCIACAO")).toBe("Suprimentos");
      expect(directorateOf("OC_APROVACAO")).toBe("Suprimentos");
      expect(directorateOf("AGUARDANDO")).toBe("Suprimentos");
      expect(directorateOf("EM_PAGAMENTO")).toBe("Contas a Pagar");
    });
  });

  describe("buildStageCounters & buildDirectorateBreakdown", () => {
    const rows = [
      { stage: "E1", value: 100 },
      { stage: "E2", value: 200 },
      { stage: "E3", tooltip: { statusCompromisso: "INCOMPLETE" }, value: 300 },
      { stage: "E5", value: 400 },
      { stage: "E6", value: 500 },
      { stage: "E7", value: 600 },
      { stage: "E1", tooltip: { statusCompromisso: "CANCELLED" }, value: 999 } // ignored
    ] as any;

    it("builds counters", () => {
      const counters = buildStageCounters(rows, 1000);
      expect(counters.A_EMITIR).toEqual({ count: 0, value: 1000 });
      expect(counters.RC_APROVACAO).toEqual({ count: 1, value: 100 });
      expect(counters.NEGOCIACAO).toEqual({ count: 2, value: 500 }); // E2 + INCOMPLETE
      expect(counters.OC_APROVACAO).toEqual({ count: 0, value: 0 }); // Was overridden by INCOMPLETE
      expect(counters.AGUARDANDO).toEqual({ count: 2, value: 900 }); // E5 + E6
      expect(counters.EM_PAGAMENTO).toEqual({ count: 1, value: 600 });
    });

    it("builds breakdown", () => {
      const breakdown = buildDirectorateBreakdown(rows, 1000);
      const tec = breakdown.find(b => b.label === "Tecnologia")!;
      const sup = breakdown.find(b => b.label === "Suprimentos")!;
      const cap = breakdown.find(b => b.label === "Contas a Pagar")!;

      expect(tec.value).toBe(1100); // 1000 + 100
      expect(sup.value).toBe(1400); // 500 + 0 + 900
      expect(cap.value).toBe(600);
      expect(tec.value + sup.value + cap.value).toBe(3100);

      expect(tec.pct).toBe(1100 / 3100);
      expect(sup.pct).toBe(1400 / 3100);
      expect(cap.pct).toBe(600 / 3100);
    });
  });
});

describe("em pagamento vem de fora das linhas operacionais", () => {
  it("entra no contador e na fatia Contas a Pagar", async () => {
    const { buildStageCounters, buildDirectorateBreakdown } = await import("./esteira");
    const c = buildStageCounters([], 100, { count: 3, value: 50 });
    expect(c.EM_PAGAMENTO).toEqual({ count: 3, value: 50 });
    const d = buildDirectorateBreakdown([], 100, { count: 3, value: 50 });
    expect(d.find(x => x.label === "Contas a Pagar")?.value).toBe(50);
    expect(d.find(x => x.label === "Tecnologia")?.value).toBe(100);
  });
});

import { readFileSync } from "fs";
import { join } from "path";
import type { CommitmentSourceBundle } from "./types";

describe("buildPaymentRows", () => {
  it("creates one row per RC in payment, matching expected totals from 26/09 fixture", async () => {
    const { buildPaymentRows } = await import("./esteira");
    const jsonPath = join(__dirname, "__fixtures__", "radar-bundle-2026-09-26.json");
    const bundle: CommitmentSourceBundle = JSON.parse(readFileSync(jsonPath, "utf-8"));
    
    const rows = buildPaymentRows(bundle);
    // There should be 130 RCs (withoutRc rows are ignored by buildPaymentRows)
    expect(rows.length).toBe(130);

    // Summing value
    const totalValue = rows.reduce((sum, r) => sum + r.value, 0);
    // As per the 26/09 fixture, the total is 8210831.15
    expect(Math.abs(totalValue - 8210831.15)).toBeLessThan(0.01);
  });
});

describe("buildPaymentRows — data de pagamento e NF (iteração 8)", () => {
  it("usa a maior data de pagamento da RC e mostra as NFs quando a RC não tem fornecedor no compromisso", async () => {
    const { buildPaymentRows } = await import("./esteira");
    const bundle = {
      commitments: [], rcGroups: [],
      payments: { inPayment: [
        { rc: "RC9", nf: "111", paymentDate: "2026-10-05", pending: 10, projectName: "P", n4: "N", withoutRc: false },
        { rc: "RC9", nf: "222", paymentDate: "2026-10-20", pending: 5, projectName: "P", n4: "N", withoutRc: false },
        { rc: "", nf: "333", paymentDate: "2026-10-01", pending: 99, projectName: "P", n4: "N", withoutRc: true },
      ] },
    } as unknown as CommitmentSourceBundle;
    const rows = buildPaymentRows(bundle);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(15);
    expect(rows[0].forecastPaymentDate).toBe("2026-10-20");
    expect(rows[0].supplier).toBe("NF 111, 222");
    expect(rows[0].stage).toBe("E7");
  });
});
