import { describe, it, expect } from "vitest";
import { formatarIsoLocal } from "./format";

describe("formatarIsoLocal", () => {
  it("23h de 19/10 no fuso local continua 2026-10-19", () => {
    expect(formatarIsoLocal(new Date(2026, 9, 19, 23, 0, 0))).toBe("2026-10-19");
  });

  it("preserva dia e mês com zeros à esquerda", () => {
    expect(formatarIsoLocal(new Date(2026, 0, 5, 0, 30))).toBe("2026-01-05");
  });
});
