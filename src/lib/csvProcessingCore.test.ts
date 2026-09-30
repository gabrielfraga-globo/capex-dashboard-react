import { describe, expect, it } from "vitest";
import { parseCsvCarteira } from "./csvProcessingCore";

const ORC = [
  "N4;NomeLB;Ano;Nome do Mês;Rubrica;BG_Q3",
  '"PLAT X";"Projeto A";2026;"janeiro";"MDO";100',
  '"PLAT X";"Projeto A";2026;"janeiro";"SOLUÇÃO";200',
].join("\n");

// Compromisso_Conecta vem repetido nas linhas de 2026 e 2027 e, desde a Rubrica, quebrado por rubrica.
const REAL = [
  "N4;1º Aprovador;NomeLB;Ano;Rubrica;Orcamento_Cenarios;Realizado_Pago;Realizado_Pendente;DeltaCaixa_CAPEX;Compromisso_Conecta;A_emitir_Conecta_CAPEX",
  '"PLAT X";"";"Projeto A";2026;"MDO";100;10;5;85;30;55',
  '"PLAT X";"";"Projeto A";2026;"SOLUÇÃO";200;20;0;180;40;140',
  '"PLAT X";"";"Projeto A";2027;"MDO";0;;;0;30;0',
  '"PLAT X";"";"Projeto A";2027;"SOLUÇÃO";0;;;0;40;0',
].join("\n");

const FLUXO = ["N4;NomeLB;Ano;Mês;Rubrica;Realizado_Pago", '"PLAT X";"Projeto A";2026;1;"MDO";10'].join("\n");

describe("parseCsvCarteira — granularidade por Rubrica", () => {
  it("soma as rubricas dentro do ano sem duplicar o compromisso repetido em 2026/2027", () => {
    const { projetos } = parseCsvCarteira({ orcamentoCsv: ORC, realizadoCsv: REAL, fluxoMensalCsv: FLUXO });
    expect(projetos).toHaveLength(1);
    const p = projetos[0];
    expect(p.orcamento2026).toBe(300);
    expect(p.realizado2026).toBe(30);
    expect(p.emPagamento2026).toBe(5);
    expect(p.compromisso).toBe(70); // 30 + 40, não max(30, 40) nem 140
    expect(p.aEmitirFonte).toBe(195);
    expect(p.deltaCaixaFonte).toBe(265);
  });
});

describe("n4Curta", () => {
  it("encurta o N4 que vem em maiúsculas da base", async () => {
    const { n4Curta } = await import("./csvProcessingCore");
    expect(n4Curta("PLAT. DE CAPTAÇÃO E PRODUÇÃO")).toBe("Captação e Produção");
    expect(n4Curta("PLAT. DE PÓS-PROD. E DESIGN, PLAT. DE METADADOS E MÍDIAS")).toBe("Pós-Produção e Design, Metadados e Mídias");
    expect(n4Curta("OUTRA")).toBe("OUTRA");
  });
});

describe("porRubrica", () => {
  it("a soma de porRubrica é igual ao total do projeto", () => {
    const { projetos } = parseCsvCarteira({ orcamentoCsv: ORC, realizadoCsv: REAL, fluxoMensalCsv: FLUXO });
    expect(projetos).toHaveLength(1);
    const p = projetos[0];
    
    let sumOrc26 = 0;
    let sumReal26 = 0;
    let sumEmPag26 = 0;
    let sumComp = 0;
    
    for (const rub of Object.values(p.porRubrica)) {
      sumOrc26 += rub.orcamento2026;
      sumReal26 += rub.realizado2026;
      sumEmPag26 += rub.emPagamento2026;
      sumComp += rub.compromisso;
    }

    expect(sumOrc26).toBe(p.orcamento2026);
    expect(sumReal26).toBe(p.realizado2026);
    expect(sumEmPag26).toBe(p.emPagamento2026);
    expect(sumComp).toBe(p.compromisso);
  });
});
