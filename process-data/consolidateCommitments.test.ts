import { describe, expect, it } from "vitest";
import { consolidarCompromissos, type RawCsvRow } from "./consolidateCommitments";

function linha(overrides: Partial<RawCsvRow> = {}): RawCsvRow {
  return {
    IdPPM: "30783",
    NomeLB: "Projeto Teste",
    Rubrica: "MDO",
    REQ_COMPRA: "RCGRJ10000001",
    ORDEM_DE_COMPRA: "OCGCP10000001",
    FORNECEDOR: "FORNECEDOR TESTE",
    COMPRADOR: "COMPRADOR TESTE",
    STATUS_COMPROMISSO: "OPEN",
    STATUS_RC: "APPROVED",
    DATA_NECESSIDADE: "2026-05-07 00:00:00,000",
    DATA_PROMETIDA: "2026-05-20 00:00:00,000",
    ValorCompromisso: "1000,00",
    ...overrides,
  };
}

describe("consolidarCompromissos", () => {
  it("reconcilia o valor total e a contagem de linhas com o CSV de origem", () => {
    const linhas = [
      linha({ ValorCompromisso: "24344,90" }),
      linha({ REQ_COMPRA: "RCGRJ10000002", ORDEM_DE_COMPRA: "OCGCP10000002", ValorCompromisso: "6099,31" }),
    ];

    const bundle = consolidarCompromissos(linhas, 2026);

    const somaCsv = linhas.reduce((acc, l) => acc + Number(l.ValorCompromisso.replace(",", ".")), 0);
    expect(bundle.totals.value).toBeCloseTo(somaCsv, 2);
    expect(bundle.totals.lines).toBe(linhas.length);
    expect(bundle.discardedLines).toBe(0);
  });

  it("linha sem OC vira chave PENDING", () => {
    const linhas = [linha({ ORDEM_DE_COMPRA: "" })];

    const bundle = consolidarCompromissos(linhas, 2026);

    expect(bundle.commitments).toHaveLength(1);
    expect(bundle.commitments[0].oc).toBe("PENDING");
    expect(bundle.commitments[0].commitmentKey).toBe("RC:RCGRJ10000001|OC:PENDING|PPM:30783");
  });

  it("valor negativo é somado normalmente", () => {
    const linhas = [linha({ ValorCompromisso: "-42933,51" })];

    const bundle = consolidarCompromissos(linhas, 2026);

    expect(bundle.commitments[0].sourceValue).toBeCloseTo(-42933.51, 2);
    expect(bundle.totals.value).toBeCloseTo(-42933.51, 2);
  });

  it("RC com 2 PPMs gera 2 chaves e 1 rcGroup com isHeterogeneous = true", () => {
    const linhas = [
      linha({ IdPPM: "30783", ORDEM_DE_COMPRA: "OCGCP10000001" }),
      linha({ IdPPM: "30791", ORDEM_DE_COMPRA: "OCGCP10000001" }),
    ];

    const bundle = consolidarCompromissos(linhas, 2026);

    expect(bundle.commitments).toHaveLength(2);
    expect(bundle.rcGroups).toHaveLength(1);
    expect(bundle.rcGroups[0].isHeterogeneous).toBe(true);
    expect(bundle.rcGroups[0].heterogeneityReasons).toContain("multiplos_projetos");
  });

  it("linha sem DATA_PROMETIDA não quebra o parse", () => {
    const linhas = [linha({ DATA_PROMETIDA: "" })];

    const bundle = consolidarCompromissos(linhas, 2026);

    expect(bundle.commitments[0].systemPromisedDate).toBeNull();
    expect(bundle.discardedLines).toBe(0);
  });

  it("propaga REQ_DESCRICAO sem alterar chave ou valor", () => {
    const bundle = consolidarCompromissos([linha({ REQ_DESCRICAO: "Descrição completa da requisição" })], 2026);

    expect(bundle.commitments[0].requestDescription).toBe("Descrição completa da requisição");
    expect(bundle.commitments[0].details[0].requestDescription).toBe("Descrição completa da requisição");
    expect(bundle.commitments[0].commitmentKey).toBe("RC:RCGRJ10000001|OC:OCGCP10000001|PPM:30783");
    expect(bundle.totals.value).toBe(1000);
  });
});
