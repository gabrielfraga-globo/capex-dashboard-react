export const SEM_PLATAFORMA = "Sem plataforma";

export interface ComposicaoPlataforma {
  plataforma: string;
  bg: number;
  caixa: number;
  compromisso: number;
  saldo: number;
  excesso: number;
  pctCaixa: number | null;
  pctComprometido: number | null;
}

export interface ComposicaoEntrada {
  n4Curta: string | null;
  orcamento2026: number | null;
  realizado2026: number | null;
  emPagamento2026: number | null;
  compromisso: number | null;
}

interface Acumulado {
  bg: number;
  realizado: number;
  emPagamento: number;
  compromisso: number;
}

export function buildComposicaoPlataforma(lista: ComposicaoEntrada[]): ComposicaoPlataforma[] {
  const porPlataforma = new Map<string, Acumulado>();

  for (const linha of lista) {
    const plataforma = linha.n4Curta && linha.n4Curta.trim() !== "" ? linha.n4Curta : SEM_PLATAFORMA;
    const acc = porPlataforma.get(plataforma) ?? { bg: 0, realizado: 0, emPagamento: 0, compromisso: 0 };
    acc.bg += linha.orcamento2026 ?? 0;
    acc.realizado += linha.realizado2026 ?? 0;
    acc.emPagamento += linha.emPagamento2026 ?? 0;
    acc.compromisso += linha.compromisso ?? 0;
    porPlataforma.set(plataforma, acc);
  }

  const itens: ComposicaoPlataforma[] = [];
  for (const [plataforma, acc] of porPlataforma) {
    const caixa = acc.realizado + acc.emPagamento;
    if (acc.bg === 0 && caixa === 0 && acc.compromisso === 0) continue;

    const comprometido = caixa + acc.compromisso;
    itens.push({
      plataforma,
      bg: acc.bg,
      caixa,
      compromisso: acc.compromisso,
      saldo: Math.max(0, acc.bg - comprometido),
      excesso: Math.max(0, comprometido - acc.bg),
      pctCaixa: acc.bg > 0 ? caixa / acc.bg : null,
      pctComprometido: acc.bg > 0 ? comprometido / acc.bg : null,
    });
  }

  return itens.sort((a, b) => b.bg - a.bg || a.plataforma.localeCompare(b.plataforma, "pt-BR"));
}
