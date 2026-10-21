import { normalizeKey } from "../../lib/csvProcessingCore";
import type { ProjetoMetricas } from "../../types";
import { mesesDesde, saldoTotalDe } from "../saldo/saldo";
import { SALDO_SIGNAL_TOLERANCE } from "../saldo/saldoConfig";
import type { SaldoRecorteView } from "../radar/types";
import type { AttentionSource } from "./types";

type ViewProjeto = Pick<
  SaldoRecorteView,
  "key" | "label" | "aprovador" | "orcamento" | "caixa" | "compromissoTotal" | "saldoPotencial"
>;

export interface RiscoProjeto {
  projectName: string;
  platformManager: string | null;
  value: number;
}

type ProjetoNome = Pick<ProjetoMetricas, "id" | "nome">;

export function acimaDe(viewsProjeto: readonly ViewProjeto[]): AttentionSource[] {
  return viewsProjeto
    .filter((v) => saldoTotalDe(v) < -SALDO_SIGNAL_TOLERANCE)
    .map((v) => ({
      projectKey: v.key,
      projectName: v.label,
      owner: v.aprovador ?? null,
      value: -saldoTotalDe(v),
    }));
}

export function paradosDe(
  viewsProjeto: readonly ViewProjeto[],
  ultimaDataParada: ReadonlyMap<string, string | null>,
  dataReferencia: string,
): AttentionSource[] {
  return viewsProjeto
    .filter((v) => v.saldoPotencial > 0)
    .map((v) => ({
      projectKey: v.key,
      projectName: v.label,
      owner: v.aprovador ?? null,
      value: v.saldoPotencial,
      mesesSemCompromisso: mesesDesde(ultimaDataParada.get(v.key) ?? null, dataReferencia),
    }));
}

/** O risco traz só o nome do projeto: a chave só é o id quando o nome identifica um único projeto. */
export function emRiscoDe(riskProjects: readonly RiscoProjeto[], listaAno: readonly ProjetoNome[]): AttentionSource[] {
  const idsPorNome = new Map<string, Set<string>>();
  for (const p of listaAno) {
    const chave = normalizeKey(p.nome);
    const ids = idsPorNome.get(chave) ?? new Set<string>();
    ids.add(p.id);
    idsPorNome.set(chave, ids);
  }

  return riskProjects.map((r) => {
    const ids = idsPorNome.get(normalizeKey(r.projectName));
    const unico = ids?.size === 1 ? Array.from(ids)[0] : undefined;
    return {
      projectKey: unico ?? `risco:${r.projectName}`,
      projectName: r.projectName,
      owner: r.platformManager ?? null,
      value: r.value,
    };
  });
}
