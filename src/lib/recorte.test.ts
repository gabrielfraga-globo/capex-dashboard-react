import { describe, expect, it } from "vitest";
import type { ProjetoBase } from "../types";
import type { RcView, CommitmentView } from "../features/radar/types";
import type { PaymentRecord } from "../features/radar/payment";
import {
  pagamentoNoRecorte,
  projetoNoRecorte,
  projetoNoRecorteComRubrica,
  rcNoRecorte,
  rubricasDisponiveis,
  type ProjetosPorKey,
  type Recorte,
} from "./recorte";

const VAZIO: Recorte = { programa: null, rubricas: [], plataforma: null, gestor: null, aprovador: null, busca: "" };
const recorte = (over: Partial<Recorte>): Recorte => ({ ...VAZIO, ...over });

const projeto = (nome: string, over: Partial<ProjetoBase> = {}) =>
  ({ id: nome, nome, n4Curta: "Captação", gestor: null, aprovador: null, porRubrica: {}, ...over }) as unknown as ProjetoBase;

const indice = (...ps: ProjetoBase[]): ProjetosPorKey => new Map(ps.map((p) => [p.nome, p]));

const commitment = (over: Partial<CommitmentView> = {}) =>
  ({ rc: "RC1", oc: "OC1", projectId: "P1", projectName: "A", rubrica: "MDO", supplier: "", systemStatus: "", ...over }) as unknown as CommitmentView;

const rcView = (rc: string, commitments: CommitmentView[]) => ({ rc, commitments }) as unknown as RcView;

const pagamento = (over: Partial<PaymentRecord> = {}) =>
  ({ rc: "RC1", nf: null, projectName: "A", rubrica: null, approver: null, withoutRc: false, ...over }) as unknown as PaymentRecord;

const ANO = 2026;

describe("rcNoRecorte", () => {
  const projetos = indice(projeto("A", { porRubrica: { MDO: {} as never } }));

  it("RC com compromisso RESERVA entra mesmo em projeto sem orçamento RESERVA", () => {
    const rc = rcView("RC1", [commitment({ rubrica: "RESERVA", projectName: "A" })]);
    expect(rcNoRecorte(rc, recorte({ rubricas: ["RESERVA"] }), projetos, ANO)).toBe(true);
    expect(projetoNoRecorteComRubrica(projetos.get("A")!, recorte({ rubricas: ["RESERVA"] }))).toBe(false);
  });

  it("RC sem RESERVA não entra quando filtrada por RESERVA", () => {
    const rc = rcView("RC1", [commitment({ rubrica: "MDO" })]);
    expect(rcNoRecorte(rc, recorte({ rubricas: ["RESERVA"] }), projetos, ANO)).toBe(false);
  });

  it("RC com duas rubricas entra por qualquer uma delas", () => {
    const rc = rcView("RC1", [commitment({ rubrica: "MDO" }), commitment({ oc: "OC2", rubrica: "RESERVA" })]);
    expect(rcNoRecorte(rc, recorte({ rubricas: ["RESERVA"] }), projetos, ANO)).toBe(true);
    expect(rcNoRecorte(rc, recorte({ rubricas: ["MDO"] }), projetos, ANO)).toBe(true);
    expect(rcNoRecorte(rc, recorte({ rubricas: ["OUTRA"] }), projetos, ANO)).toBe(false);
  });

  it("programa e aprovador filtram a RC pelo projeto", () => {
    const idx = indice(
      projeto("A", { n4Curta: "Captação", aprovador: "Ana" }),
      projeto("B", { n4Curta: "Pós-Produção", aprovador: "Bia" }),
    );
    const rc = rcView("RC1", [commitment({ projectName: "A" }), commitment({ oc: "OC2", projectName: "B" })]);
    expect(rcNoRecorte(rc, recorte({ programa: "Pós-Produção" }), idx, ANO)).toBe(true);
    expect(rcNoRecorte(rc, recorte({ programa: "Outro" }), idx, ANO)).toBe(false);
    expect(rcNoRecorte(rc, recorte({ aprovador: "Ana" }), idx, ANO)).toBe(true);
    expect(rcNoRecorte(rc, recorte({ aprovador: "Carlos" }), idx, ANO)).toBe(false);
  });

  it("busca casa fornecedor, descrição e número da RC sem diferenciar caixa nem acento", () => {
    const rc = rcView("RC123", [commitment({ supplier: "Acme Ltda", requestDescription: "Licença de software" })]);
    expect(rcNoRecorte(rc, recorte({ busca: "acme" }), projetos, ANO)).toBe(true);
    expect(rcNoRecorte(rc, recorte({ busca: "LICENÇA" }), projetos, ANO)).toBe(true);
    expect(rcNoRecorte(rc, recorte({ busca: "rc123" }), projetos, ANO)).toBe(true);
    expect(rcNoRecorte(rc, recorte({ busca: "inexistente" }), projetos, ANO)).toBe(false);
    expect(rcNoRecorte(rc, recorte({ busca: "   " }), projetos, ANO)).toBe(true);
  });
});

describe("pagamentoNoRecorte", () => {
  const projetos = indice(projeto("A", { aprovador: "Bia" }));

  it("filtra pagamento pela rubrica da linha", () => {
    expect(pagamentoNoRecorte(pagamento({ rubrica: "RESERVA" }), recorte({ rubricas: ["RESERVA"] }), projetos)).toBe(true);
    expect(pagamentoNoRecorte(pagamento({ rubrica: "MDO" }), recorte({ rubricas: ["RESERVA"] }), projetos)).toBe(false);
  });

  it("aprovador casa pelo projeto ou pelo approver da própria linha", () => {
    const pg = pagamento({ approver: "Ana" });
    expect(pagamentoNoRecorte(pg, recorte({ aprovador: "Ana" }), projetos)).toBe(true);
    expect(pagamentoNoRecorte(pg, recorte({ aprovador: "Bia" }), projetos)).toBe(true);
    expect(pagamentoNoRecorte(pg, recorte({ aprovador: "Carlos" }), projetos)).toBe(false);
  });

  it("busca casa RC, NF e nome do projeto", () => {
    const pg = pagamento({ nf: "NF-99", projectName: "A" });
    expect(pagamentoNoRecorte(pg, recorte({ busca: "nf-99" }), projetos)).toBe(true);
    expect(pagamentoNoRecorte(pg, recorte({ busca: "zzz" }), projetos)).toBe(false);
  });
});

describe("projetoNoRecorte", () => {
  it("compara programa, plataforma, gestor e aprovador", () => {
    const p = projeto("A", { n4Curta: "Captação", gestor: "Gina", aprovador: "Ana" });
    expect(projetoNoRecorte(p, recorte({ programa: "Captação", gestor: "Gina", aprovador: "Ana", plataforma: "Captação" }))).toBe(true);
    expect(projetoNoRecorte(p, recorte({ gestor: "Outro" }))).toBe(false);
  });
});

describe("rubricasDisponiveis", () => {
  it("une rubricas de projetos, RCs e pagamentos, sem vazios e ordenadas", () => {
    const projetos = [projeto("A", { porRubrica: { MDO: {} as never, "SOLUÇÃO": {} as never } })];
    const rcs = [rcView("RC1", [commitment({ rubrica: "RESERVA" })])];
    const pagamentos = [pagamento({ rubrica: "SOLUÇÃO" }), pagamento({ rubrica: null }), pagamento({ rubrica: "" })];
    expect(rubricasDisponiveis(projetos, rcs, pagamentos)).toEqual(["MDO", "RESERVA", "SOLUÇÃO"]);
  });
});

describe("recorte vazio", () => {
  it("aceita tudo, inclusive RC e pagamento sem projeto resolvido", () => {
    const vazio = indice();
    expect(rcNoRecorte(rcView("RC1", [commitment({ projectName: "Inexistente" })]), VAZIO, vazio, ANO)).toBe(true);
    expect(pagamentoNoRecorte(pagamento({ projectName: "Inexistente" }), VAZIO, vazio)).toBe(true);
    expect(projetoNoRecorte(projeto("A"), VAZIO)).toBe(true);
  });
});
