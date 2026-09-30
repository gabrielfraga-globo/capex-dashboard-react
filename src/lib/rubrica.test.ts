import { describe, expect, it } from "vitest";
import { aplicarFiltroRubrica, rubricasDisponiveis } from "./rubrica";
import type { ProjetoBase } from "../types";

const rub = (o26: number, r26: number, comp: number) => ({
  orcamento2026: o26, orcamento2027: 0, realizado2026: r26, emPagamento2026: 0, realizado2027: 0, emPagamento2027: 0,
  compromisso: comp, meses2026: Array(12).fill(o26 / 12), meses2027: [0, 0, 0], executadoMensal2026: Array(12).fill(0),
});
const proj = (nome: string, porRubrica: ProjetoBase["porRubrica"]) => ({
  id: nome, nome, orcamento2026: 999, realizado2026: 999, compromisso: 999, porRubrica,
}) as unknown as ProjetoBase;

describe("aplicarFiltroRubrica", () => {
  const lista = [
    proj("A", { MDO: rub(120, 10, 5), "SOLUÇÃO": rub(240, 20, 7) }),
    proj("B", { "SOLUÇÃO": rub(60, 0, 0), NAO_INFORMADA: rub(0, 0, 0) }),
  ];

  it("sem rubrica escolhida devolve a mesma lista (nenhum número muda)", () => {
    expect(aplicarFiltroRubrica(lista, [])).toBe(lista);
  });

  it("soma só as rubricas escolhidas e tira projetos zerados", () => {
    const r = aplicarFiltroRubrica(lista, ["MDO"]);
    expect(r.map((p) => p.nome)).toEqual(["A"]);
    expect(r[0].orcamento2026).toBe(120);
    expect(r[0].realizado2026).toBe(10);
    expect(r[0].compromisso).toBe(5);
    expect(r[0].h1_2026).toBeCloseTo(60);
  });

  it("MDO + SOLUÇÃO soma as duas", () => {
    const r = aplicarFiltroRubrica(lista, ["MDO", "SOLUÇÃO"]);
    expect(r.reduce((a, p) => a + (p.orcamento2026 ?? 0), 0)).toBe(420);
  });

  it("rubricasDisponiveis esconde rubrica sem valor", () => {
    expect(rubricasDisponiveis(lista)).toEqual(["MDO", "SOLUÇÃO"]);
  });
});
