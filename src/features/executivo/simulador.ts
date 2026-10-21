import type { ProjetoMetricas } from "../../types";
import type { OperationalRow } from "../radar/operational";
import { LIMIAR_MATERIALIDADE } from "../../lib/metrics";

export type Horizonte = "hoje" | "mes" | "tri" | "ano";

export type StatusAderencia = "NO_RITMO" | "ANTECIPANDO" | "POSTERGANDO";

export const TOL_PCT_RITMO = 0.1;

const MESES_NOMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const pad2 = (n: number) => String(n).padStart(2, "0");

function diasNoMes(ano: number, mes: number): number {
  if (mes === 2) {
    const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
    return bissexto ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

function isoData(ano: number, mes: number, dia: number): string {
  return `${ano}-${pad2(mes)}-${pad2(dia)}`;
}

/**
 * Meses fechados do exercício até a data de referência (regra M-1 do card Fluxo, mesma
 * lógica de mesesDecorridos em metrics.ts, mas parametrizada pelo `ref`).
 */
function mesesFechadosAte(ref: Date, exerciseYear: number): number {
  const mesAnterior = ref.getMonth() === 0 ? 12 : ref.getMonth();
  const anoAnterior = ref.getMonth() === 0 ? ref.getFullYear() - 1 : ref.getFullYear();
  if (anoAnterior > exerciseYear) return 12;
  if (anoAnterior < exerciseYear) return 0;
  return mesAnterior;
}

export function triIgualAno(ref: Date, ano: number): boolean {
  return ref.getFullYear() === ano && ref.getMonth() >= 9;
}

export function horizonte(
  h: Horizonte,
  ref: Date,
  exerciseYear: number,
): { fim: string; mesesPlano: number; label: string } {
  const ano = ref.getFullYear();
  const mes = ref.getMonth() + 1;
  const trimestreFim = Math.ceil(mes / 3) * 3;

  switch (h) {
    case "hoje":
      return {
        fim: isoData(ano, mes, ref.getDate()),
        mesesPlano: mesesFechadosAte(ref, exerciseYear),
        label: `Hoje (${pad2(ref.getDate())}/${pad2(mes)}/${ano})`,
      };
    case "mes":
      return {
        fim: isoData(ano, mes, diasNoMes(ano, mes)),
        mesesPlano: mes,
        label: `Fim de ${MESES_NOMES[mes - 1]}/${ano}`,
      };
    case "tri":
      return {
        fim: isoData(ano, trimestreFim, diasNoMes(ano, trimestreFim)),
        mesesPlano: trimestreFim,
        label: `Fim do ${trimestreFim / 3}º tri/${ano}`,
      };
    case "ano":
      return {
        fim: `${exerciseYear}-12-31`,
        mesesPlano: 12,
        label: `Fim de ${exerciseYear}`,
      };
  }
}

export function toleranciaDoPlano(plano: number): number {
  return Math.max(LIMIAR_MATERIALIDADE, TOL_PCT_RITMO * plano);
}

export interface ItemSimulacao {
  id: string;
  nome: string;
  gestor: string | null;
  plano: number;
  projetado: number;
  desvio: number;
  status: StatusAderencia;
}

export interface GrupoSimulacao {
  qtd: number;
  desvio: number;
}

export interface SimulacaoBG {
  horizonte: Horizonte;
  fim: string;
  label: string;
  plano: number;
  projetado: number;
  grupos: {
    noRitmo: GrupoSimulacao;
    antecipando: GrupoSimulacao;
    postergando: GrupoSimulacao;
  };
  semData: { qtd: number; valor: number };
  orfas: { qtd: number; valor: number };
  itens: ItemSimulacao[];
}

export interface SimulacaoBGInput {
  projetos: ProjetoMetricas[];
  rows: OperationalRow[];
  h: Horizonte;
  ref: Date;
  exerciseYear: number;
  incluirRisco: boolean;
}

const normalizaNome = (nome: string) => nome.trim().toLowerCase();

/** Mesma repartição por projeto usada por partesPorProjeto em radar/executive.ts (função privada). */
function partesPorProjeto(r: OperationalRow): Array<[string, number]> {
  if (r.valueByProject && Object.keys(r.valueByProject).length) return Object.entries(r.valueByProject);
  return [[r.projectName ?? "", r.value]];
}

/** Plano acumulado até `meses`: mesma regra de fallback de planejadoAcumuladoAno (metrics.ts). */
function planoAteMes(p: ProjetoMetricas, meses: number): number {
  if (p.meses2026 && p.meses2026.length === 12) {
    return p.meses2026.slice(0, meses).reduce((a, b) => a + b, 0);
  }
  return (p.orcamento2026 ?? 0) * (meses / 12);
}

function statusDoDesvio(desvio: number, tol: number): StatusAderencia {
  if (desvio > tol) return "ANTECIPANDO";
  if (desvio < -tol) return "POSTERGANDO";
  return "NO_RITMO";
}

export function simularBG(input: SimulacaoBGInput): SimulacaoBG {
  const { projetos, rows, h, ref, exerciseYear, incluirRisco } = input;
  const { fim, mesesPlano, label } = horizonte(h, ref, exerciseYear);

  const chaves = new Set(projetos.map((p) => normalizaNome(p.nome)));
  const futuroPorProjeto = new Map<string, number>();
  const semDataRows = new Set<number>();
  const orfasRows = new Set<number>();
  let semDataValor = 0;
  let orfasValor = 0;

  // Hoje: só o realizado conta, nenhuma RC futura entra (e semData/orfas ficam zerados).
  if (h !== "hoje") {
    rows.forEach((r, idx) => {
      // mesmo filtro de estágio de buildBgVivo (radar/executive.ts, linhas 725-727)
      if (r.stage === "DESCONHECIDA" || r.stage === "RESIDUAL") return;
      if (r.classification === "NAO_OCORRE" || r.classification === "CAIXA_27") return;
      if (!incluirRisco && r.classification === "EM_RISCO") return;

      const data = r.forecastPaymentDate ?? r.suggestedPaymentDate;
      const dataIso = data ? data.slice(0, 10) : null;

      for (const [nome, valor] of partesPorProjeto(r)) {
        const chave = normalizaNome(nome);
        if (dataIso === null) {
          if (chaves.has(chave)) {
            semDataRows.add(idx);
            semDataValor += valor;
          }
        } else if (dataIso <= fim) {
          // Mesmo critério de elegibilidade para órfã: só conta se entraria no projetado.
          if (chaves.has(chave)) {
            futuroPorProjeto.set(chave, (futuroPorProjeto.get(chave) ?? 0) + valor);
          } else {
            orfasRows.add(idx);
            orfasValor += valor;
          }
        }
      }
    });
  }

  const itens: ItemSimulacao[] = projetos.map((p) => {
    const plano = planoAteMes(p, mesesPlano);
    const executado = (p.realizado2026 ?? 0) + (p.emPagamento2026 ?? 0);
    const projetado = executado + (futuroPorProjeto.get(normalizaNome(p.nome)) ?? 0);
    const desvio = projetado - plano;
    return {
      id: p.id,
      nome: p.nome,
      gestor: p.gestor,
      plano,
      projetado,
      desvio,
      status: statusDoDesvio(desvio, toleranciaDoPlano(plano)),
    };
  });

  const grupos = {
    noRitmo: { qtd: 0, desvio: 0 },
    antecipando: { qtd: 0, desvio: 0 },
    postergando: { qtd: 0, desvio: 0 },
  };
  const chaveGrupo = { NO_RITMO: "noRitmo", ANTECIPANDO: "antecipando", POSTERGANDO: "postergando" } as const;
  for (const it of itens) {
    const g = grupos[chaveGrupo[it.status]];
    g.qtd += 1;
    g.desvio += it.desvio;
  }

  return {
    horizonte: h,
    fim,
    label,
    plano: itens.reduce((s, it) => s + it.plano, 0),
    projetado: itens.reduce((s, it) => s + it.projetado, 0),
    grupos,
    semData: { qtd: semDataRows.size, valor: semDataValor },
    orfas: { qtd: orfasRows.size, valor: orfasValor },
    itens,
  };
}
