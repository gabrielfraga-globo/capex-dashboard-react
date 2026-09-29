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
