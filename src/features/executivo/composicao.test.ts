import { describe, expect, it } from "vitest";
import { buildComposicaoPlataforma, SEM_PLATAFORMA, type ComposicaoEntrada } from "./composicao";

const linha = (over: Partial<ComposicaoEntrada> = {}): ComposicaoEntrada => ({
  n4Curta: "Plataforma A",
  orcamento2026: 0,
  realizado2026: 0,
  emPagamento2026: 0,
  compromisso: 0,
  ...over,
});

const LISTA: ComposicaoEntrada[] = [
  linha({ n4Curta: "Operação", orcamento2026: 100, realizado2026: 40, emPagamento2026: 10, compromisso: 30 }),
  linha({ n4Curta: "Operação", orcamento2026: 50, realizado2026: 5, emPagamento2026: null, compromisso: null }),
  linha({ n4Curta: "Captação e Produção", orcamento2026: 80, realizado2026: 60, emPagamento2026: 20, compromisso: 50 }),
  linha({ n4Curta: "Rede", orcamento2026: 300, realizado2026: 120, emPagamento2026: 30, compromisso: 10 }),
  linha({ n4Curta: null, orcamento2026: 20, realizado2026: 0, emPagamento2026: 0, compromisso: 0 }),
  linha({ n4Curta: "  ", orcamento2026: 0, realizado2026: 0, emPagamento2026: 0, compromisso: 0 }),
  linha({ n4Curta: "Zerada", orcamento2026: null, realizado2026: null, emPagamento2026: null, compromisso: null }),
];

const soma = (xs: Array<number | null>) => xs.reduce<number>((s, v) => s + (v ?? 0), 0);

describe("buildComposicaoPlataforma", () => {
  const itens = buildComposicaoPlataforma(LISTA);

  it("preserva as somas de BG, caixa e compromisso da entrada", () => {
    const bgEntrada = soma(LISTA.map((l) => l.orcamento2026));
    const caixaEntrada = soma(LISTA.map((l) => (l.realizado2026 ?? 0) + (l.emPagamento2026 ?? 0)));
    const compEntrada = soma(LISTA.map((l) => l.compromisso));

    expect(soma(itens.map((i) => i.bg))).toBe(bgEntrada);
    expect(soma(itens.map((i) => i.caixa))).toBe(caixaEntrada);
    expect(soma(itens.map((i) => i.compromisso))).toBe(compEntrada);
  });

  it("excesso só existe quando caixa + compromisso passam do BG; saldo e excesso nunca ambos > 0", () => {
    for (const i of itens) {
      const comprometido = i.caixa + i.compromisso;
      if (comprometido > i.bg) {
        expect(i.excesso).toBeCloseTo(comprometido - i.bg);
        expect(i.saldo).toBe(0);
      } else {
        expect(i.excesso).toBe(0);
        expect(i.saldo).toBeCloseTo(i.bg - comprometido);
      }
      expect(i.saldo > 0 && i.excesso > 0).toBe(false);
    }
    const captacao = itens.find((i) => i.plataforma === "Captação e Produção");
    expect(captacao?.excesso).toBe(50);
    expect(captacao?.saldo).toBe(0);
  });

  it("ordena por BG decrescente", () => {
    const bgs = itens.map((i) => i.bg);
    expect(bgs).toEqual([...bgs].sort((a, b) => b - a));
    expect(itens[0].plataforma).toBe("Rede");
  });

  it("agrupa n4Curta nulo ou vazio em 'Sem plataforma'", () => {
    const semPlataforma = itens.find((i) => i.plataforma === SEM_PLATAFORMA);
    expect(semPlataforma?.bg).toBe(20);
    expect(itens.filter((i) => i.plataforma === SEM_PLATAFORMA)).toHaveLength(1);
  });

  it("calcula percentuais e devolve null quando BG é 0", () => {
    const operacao = itens.find((i) => i.plataforma === "Operação");
    expect(operacao?.pctCaixa).toBeCloseTo(55 / 150);
    expect(operacao?.pctComprometido).toBeCloseTo(85 / 150);

    const semBg = buildComposicaoPlataforma([linha({ n4Curta: "Sem BG", orcamento2026: 0, realizado2026: 10, compromisso: 5 })]);
    expect(semBg).toHaveLength(1);
    expect(semBg[0].pctCaixa).toBeNull();
    expect(semBg[0].pctComprometido).toBeNull();
    expect(semBg[0].excesso).toBe(15);
  });

  it("descarta plataformas com BG, caixa e compromisso todos zero", () => {
    expect(itens.find((i) => i.plataforma === "Zerada")).toBeUndefined();
    expect(itens.find((i) => i.plataforma === "  ")).toBeUndefined();
  });

  it("retorna lista vazia para entrada vazia", () => {
    expect(buildComposicaoPlataforma([])).toEqual([]);
  });
});
