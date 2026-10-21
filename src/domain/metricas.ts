import type { ProjetoBase } from "../types";
import type { OperationalRow } from "../features/radar/operational";
import { buildBgVivo } from "../features/radar/executive";

export interface ResultadoPremissa {
  bg: number;
  pago: number;
  emPagamento: number;
  elegivel: number;
  provisionado: number;
  pctBG: number;
  comprometido: number;
  excesso: number;
  emRiscoSinal: number;
  declarado27: number;
}

export interface PremissaSimples {
  projetos: Array<ResultadoPremissa & { projeto: string }>;
  total: ResultadoPremissa;
}

export interface PremissaCompleta {
  bg: number;
  pago: number;
  emPagamento: number;
  /** CAIXA_26 + EM_RISCO */
  comp26: number;
  cx26: number;
  emRisco: number;
  /** CAIXA_27 */
  comp27: number;
}

const normalizarNome = (nome: string) => nome.trim().toLocaleLowerCase("pt-BR");

const ehPendenteDeCaixa = (linha: OperationalRow) => linha.stage !== "DESCONHECIDA" && linha.stage !== "RESIDUAL";

/** Decisão do gestor que tira a linha do elegível: NAO_OCORRE ou CAIXA_27 confirmada. */
const ehDecisaoExcludente = (linha: OperationalRow) =>
  linha.classification === "NAO_OCORRE" || (linha.classification === "CAIXA_27" && linha.isClassificationConfirmed);

const ehDecisaoCaixa27 = (linha: OperationalRow) =>
  linha.classification === "CAIXA_27" && linha.isClassificationConfirmed;

const ehEmRiscoSinal = (linha: OperationalRow) =>
  linha.stage === "E1" || linha.stage === "E2" || linha.stage === "E3" || linha.subState === "E4_ATRASADO";

/** Quebra o valor da linha por projeto (nome normalizado). */
function repartirPorProjeto(linha: OperationalRow): Array<[string, number]> {
  const split = linha.valueByProject ?? { [linha.projectName]: linha.value };
  return Object.entries(split).map(([nome, valor]) => [normalizarNome(nome), valor]);
}

interface AcumuladoProjeto {
  elegivel: number;
  emRiscoElegivel: number;
  declarado27: number;
}

function acumularLinhas(linhas: OperationalRow[]): Map<string, AcumuladoProjeto> {
  const mapa = new Map<string, AcumuladoProjeto>();
  const obter = (chave: string) => {
    let acc = mapa.get(chave);
    if (!acc) {
      acc = { elegivel: 0, emRiscoElegivel: 0, declarado27: 0 };
      mapa.set(chave, acc);
    }
    return acc;
  };

  for (const linha of linhas) {
    if (!ehPendenteDeCaixa(linha)) continue;
    const elegivelLinha = !ehDecisaoExcludente(linha);
    const riscoLinha = ehEmRiscoSinal(linha);
    const decl27 = ehDecisaoCaixa27(linha);
    for (const [chave, valor] of repartirPorProjeto(linha)) {
      const acc = obter(chave);
      if (elegivelLinha) {
        acc.elegivel += valor;
        if (riscoLinha) acc.emRiscoElegivel += valor;
      }
      if (decl27) acc.declarado27 += valor;
    }
  }
  return mapa;
}

function resultadoProjeto(p: ProjetoBase, acc: AcumuladoProjeto | undefined): ResultadoPremissa {
  const bg = p.orcamento2026 ?? 0;
  const pago = p.realizado2026 ?? 0;
  const emPagamento = p.emPagamento2026 ?? 0;
  const elegivel = acc?.elegivel ?? 0;
  const espaco = Math.max(0, bg - pago - emPagamento);
  const comprometido = Math.min(elegivel, espaco);
  const excesso = elegivel - comprometido;
  const provisionado = pago + emPagamento + comprometido;
  const emRiscoSinal = elegivel > 0 ? comprometido * ((acc?.emRiscoElegivel ?? 0) / elegivel) : 0;
  return {
    bg,
    pago,
    emPagamento,
    elegivel,
    provisionado,
    pctBG: bg > 0 ? provisionado / bg : 0,
    comprometido,
    excesso,
    emRiscoSinal,
    declarado27: acc?.declarado27 ?? 0,
  };
}

function somarResultados(itens: ResultadoPremissa[]): ResultadoPremissa {
  const soma = itens.reduce(
    (t, r) => ({
      bg: t.bg + r.bg,
      pago: t.pago + r.pago,
      emPagamento: t.emPagamento + r.emPagamento,
      elegivel: t.elegivel + r.elegivel,
      provisionado: t.provisionado + r.provisionado,
      comprometido: t.comprometido + r.comprometido,
      excesso: t.excesso + r.excesso,
      emRiscoSinal: t.emRiscoSinal + r.emRiscoSinal,
      declarado27: t.declarado27 + r.declarado27,
    }),
    { bg: 0, pago: 0, emPagamento: 0, elegivel: 0, provisionado: 0, comprometido: 0, excesso: 0, emRiscoSinal: 0, declarado27: 0 }
  );
  return { ...soma, pctBG: soma.bg > 0 ? soma.provisionado / soma.bg : 0 };
}

/** Projeto com orçamento, realizado, em pagamento ou qualquer emissão elegível (inclui CAIXA_27 automática). */
export function projetoAtivo2026(p: ProjetoBase, linhas: OperationalRow[]): boolean {
  if ((p.orcamento2026 ?? 0) > 0 || (p.realizado2026 ?? 0) > 0 || (p.emPagamento2026 ?? 0) > 0) return true;
  const nome = normalizarNome(p.nome);
  return linhas.some(
    (linha) =>
      ehPendenteDeCaixa(linha) &&
      !ehDecisaoExcludente(linha) &&
      repartirPorProjeto(linha).some(([chave, valor]) => chave === nome && valor > 0)
  );
}

export function premissaSimples(projetos: ProjetoBase[], linhas: OperationalRow[]): PremissaSimples {
  const acumulados = acumularLinhas(linhas);
  const porProjeto = projetos.map((p) => ({
    projeto: p.nome,
    ...resultadoProjeto(p, acumulados.get(normalizarNome(p.nome))),
  }));
  return { projetos: porProjeto, total: somarResultados(porProjeto) };
}

/** Comp26/Comp27 são somados sobre `linhas` inteiras: quem chama deve passar as linhas já filtradas pelo recorte (RCs), como em useCarteiraResumo. */
export function premissaCompleta(projetos: ProjetoBase[], linhas: OperationalRow[]): PremissaCompleta {
  const b26 = buildBgVivo(projetos, linhas, 2026);
  const b27 = buildBgVivo(projetos, linhas, 2027);
  return {
    bg: b26.bgGov,
    pago: b26.realizado,
    emPagamento: b26.emPagamento,
    comp26: b26.emitido,
    cx26: b26.emitido - b26.emRisco,
    emRisco: b26.emRisco,
    comp27: b27.emitido,
  };
}
