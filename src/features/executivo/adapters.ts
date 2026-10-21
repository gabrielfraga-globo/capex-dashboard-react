import { mesesDesde } from "../saldo/saldo";
import type { SaldoRecorteView } from "../radar/types";
import type { AttentionSource } from "./types";

type ViewProjeto = Pick<
  SaldoRecorteView,
  "key" | "label" | "aprovador" | "orcamento" | "caixa" | "compromissoTotal" | "saldoPotencial"
>;

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
