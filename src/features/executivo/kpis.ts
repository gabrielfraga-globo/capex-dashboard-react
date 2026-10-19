import type { KpisExecutivos } from "./types";

export interface KpiLinhaExecutiva {
  orcamento2026: number | null;
  realizado2026: number | null;
  emPagamento2026: number | null;
  compromisso: number | null;
}

export interface KpiSaldoEntrada {
  saldoDisponivel: number;
  saldoPotencial: number;
  projetosComSaldo: number;
}

export interface KpisExecutivosInput {
  lista: readonly KpiLinhaExecutiva[];
  planejadoAcumulado: number | null;
  saldo?: KpiSaldoEntrada | null;
}

const zero = (v: number | null | undefined): number => v ?? 0;

const razao = (parte: number, todo: number): number | null => (todo === 0 ? null : parte / todo);

export function buildKpisExecutivos(input: KpisExecutivosInput): KpisExecutivos {
  let orcamento = 0;
  let realizado = 0;
  let emPagamento = 0;
  let compromissoTotal = 0;

  for (const l of input.lista) {
    orcamento += zero(l.orcamento2026);
    realizado += zero(l.realizado2026);
    emPagamento += zero(l.emPagamento2026);
    compromissoTotal += zero(l.compromisso);
  }

  const caixa = realizado + emPagamento;
  const comprometido = caixa + compromissoTotal;
  const saldo = input.saldo ?? null;

  return {
    orcamento,
    caixa,
    emPagamento,
    pctCaixa: razao(caixa, orcamento),
    desvioPlano: input.planejadoAcumulado == null ? null : caixa - input.planejadoAcumulado,
    compromissoTotal,
    comprometido,
    pctComprometido: razao(comprometido, orcamento),
    excesso: Math.max(0, comprometido - orcamento),
    excessoSemLegado: saldo ? Math.max(0, -saldo.saldoDisponivel) : null,
    folgaParada: saldo ? saldo.saldoPotencial : null,
    projetosParados: saldo ? saldo.projetosComSaldo : null,
  };
}
