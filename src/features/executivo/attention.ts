import { fmtBRL } from "../../lib/format";
import { SALDO_SIGNAL_TOLERANCE } from "../saldo/saldoConfig";
import { ATTENTION_LIMIT, ATTENTION_PRIORITY, ATTENTION_QUOTAS, ATTENTION_ROUTES } from "./config";
import type { AttentionItem, AttentionKind, AttentionSource } from "./types";

interface AttentionInput {
  acima: AttentionSource[];
  emRisco: AttentionSource[];
  parados: AttentionSource[];
  exerciseYear: number;
}

interface AttentionOptions {
  limit?: number;
  quotas?: Partial<Record<AttentionKind, number>>;
}

interface Candidato {
  kind: AttentionKind;
  src: AttentionSource;
}

const byValueDesc = (a: AttentionSource, b: AttentionSource) => b.value - a.value;

function detailDe(kind: AttentionKind, src: AttentionSource, exerciseYear: number): string {
  if (kind === "ACIMA_ORCAMENTO") return `comprometido ${fmtBRL(src.value, true)} acima do orçamento`;
  if (kind === "RCS_EM_RISCO") return `${fmtBRL(src.value, true)} em RCs em risco`;
  const meses = src.mesesSemCompromisso;
  if (meses === null || meses === undefined) return `sem compromisso aprovado em ${exerciseYear}`;
  if (meses === 0) return "parado neste mês";
  if (meses === 1) return "parado há 1 mês";
  return `parado há ${meses} meses`;
}

/**
 * Monta a lista de atenção do executivo: no máximo um item por projeto,
 * cotas por tipo com backfill pelos maiores valores restantes.
 */
export function buildAttentionList(input: AttentionInput, opts: AttentionOptions = {}): AttentionItem[] {
  const limit = opts.limit ?? ATTENTION_LIMIT;
  const quotas = { ...ATTENTION_QUOTAS, ...opts.quotas };

  const porKind: Record<AttentionKind, AttentionSource[]> = {
    ACIMA_ORCAMENTO: input.acima,
    RCS_EM_RISCO: input.emRisco,
    SALDO_PARADO: input.parados,
  };

  // 1. Ignora sinais abaixo da tolerância em cada fonte, antes da deduplicação,
  //    para que um sinal desprezível não esconda um material de outra fonte.
  // 2. Um item por projeto: vale a fonte de maior prioridade entre as restantes.
  const vistos = new Set<string>();
  const validos: Candidato[] = [];
  for (const kind of ATTENTION_PRIORITY) {
    for (const src of porKind[kind]) {
      if (src.value < SALDO_SIGNAL_TOLERANCE) continue;
      if (vistos.has(src.projectKey)) continue;
      vistos.add(src.projectKey);
      validos.push({ kind, src });
    }
  }

  // 3. Cotas por tipo, cada fonte por valor desc.
  const selecionados = new Set<Candidato>();
  for (const kind of ATTENTION_PRIORITY) {
    validos
      .filter((c) => c.kind === kind)
      .sort((a, b) => byValueDesc(a.src, b.src))
      .slice(0, quotas[kind] ?? 0)
      .forEach((c) => selecionados.add(c));
  }

  // Backfill: vagas que sobraram vão para os maiores valores de qualquer tipo.
  const vagas = limit - selecionados.size;
  if (vagas > 0) {
    validos
      .filter((c) => !selecionados.has(c))
      .sort((a, b) => byValueDesc(a.src, b.src))
      .slice(0, vagas)
      .forEach((c) => selecionados.add(c));
  }

  // 4. Ordem final: prioridade do tipo, depois valor desc.
  return [...selecionados]
    .sort((a, b) => {
      const dp = ATTENTION_PRIORITY.indexOf(a.kind) - ATTENTION_PRIORITY.indexOf(b.kind);
      return dp !== 0 ? dp : byValueDesc(a.src, b.src);
    })
    .map(({ kind, src }) => ({
      ...src,
      kind,
      detail: detailDe(kind, src, input.exerciseYear),
      href: ATTENTION_ROUTES[kind],
    }));
}
