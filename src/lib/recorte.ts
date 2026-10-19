import type { ProjetoBase } from "../types";
import type { RcView } from "../features/radar/types";
import type { PaymentRecord } from "../features/radar/payment";
import { poStatusLabel } from "../features/radar/status";
import { aplicarFiltroRubrica } from "./rubrica";

export interface Recorte {
  programa: string | null;
  rubricas: string[];
  plataforma: string | null;
  gestor: string | null;
  aprovador: string | null;
  busca: string;
}

/** Projetos indexados pelo nome (projectName dos compromissos e pagamentos). */
export type ProjetosPorKey = Map<string, ProjetoBase>;

const normalizarTermo = (texto: string) => texto.trim().toLocaleLowerCase("pt-BR");

const temFiltroDeProjeto = (r: Recorte) => Boolean(r.programa || r.plataforma || r.gestor || r.aprovador);

const semAprovador = (r: Recorte): Recorte => ({ ...r, aprovador: null });

export function projetoNoRecorte(p: ProjetoBase, r: Recorte): boolean {
  if (r.programa && p.n4Curta !== r.programa) return false;
  if (r.plataforma && p.n4Curta !== r.plataforma) return false;
  if (r.gestor && p.gestor !== r.gestor) return false;
  if (r.aprovador && p.aprovador !== r.aprovador) return false;
  return true;
}

export function projetoNoRecorteComRubrica(p: ProjetoBase, r: Recorte): boolean {
  return projetoNoRecorte(p, r) && aplicarFiltroRubrica([p], r.rubricas).length > 0;
}

function buscaRcCasa(rc: RcView, busca: string, exerciseYear: number): boolean {
  const termo = normalizarTermo(busca);
  if (!termo) return true;
  const textos = rc.commitments.flatMap((commitment) => [
    rc.rc,
    commitment.oc,
    commitment.projectId,
    commitment.projectName,
    commitment.supplier || commitment.projectName,
    commitment.curation?.poStatus ?? "",
    commitment.curation ? poStatusLabel(commitment.curation.poStatus, exerciseYear) : "",
    commitment.systemStatus,
    commitment.requestDescription ?? "",
    commitment.curation?.notes ?? "",
  ]);
  return textos.some((texto) => texto.toLocaleLowerCase("pt-BR").includes(termo));
}

/** Uma RC entra se algum dos seus projetos passa no recorte de projeto (sem exigir orçamento na rubrica). */
export function rcNoRecorte(rc: RcView, r: Recorte, projetosPorKey: ProjetosPorKey, exerciseYear: number): boolean {
  if (temFiltroDeProjeto(r)) {
    const algumProjeto = rc.commitments.some((c) => {
      const projeto = projetosPorKey.get(c.projectName);
      return projeto !== undefined && projetoNoRecorte(projeto, r);
    });
    if (!algumProjeto) return false;
  }
  if (r.rubricas.length > 0 && !rc.commitments.some((c) => r.rubricas.includes(c.rubrica))) return false;
  return buscaRcCasa(rc, r.busca, exerciseYear);
}

/** Linha de pagamento: o aprovador também casa pelo aprovador informado na própria linha (pg.approver). */
export function pagamentoNoRecorte(pg: PaymentRecord, r: Recorte, projetosPorKey: ProjetosPorKey): boolean {
  const projeto = projetosPorKey.get(pg.projectName ?? "");
  const projetoOk = projeto ? projetoNoRecorte(projeto, semAprovador(r)) : !(r.programa || r.plataforma || r.gestor);
  if (!projetoOk) return false;
  if (r.aprovador && projeto?.aprovador !== r.aprovador && pg.approver !== r.aprovador) return false;
  if (r.rubricas.length > 0 && (!pg.rubrica || !r.rubricas.includes(pg.rubrica))) return false;
  const termo = normalizarTermo(r.busca);
  if (termo && ![pg.rc, pg.nf, pg.projectName].some((t) => (t ?? "").toLocaleLowerCase("pt-BR").includes(termo))) return false;
  return true;
}

/** União das rubricas dos projetos, RCs e pagamentos: sem vazios, ordenada. */
export function rubricasDisponiveis(projetos: ProjetoBase[], rcs: RcView[], pagamentos: PaymentRecord[]): string[] {
  const todas = new Set<string>();
  for (const p of projetos) for (const rub of Object.keys(p.porRubrica ?? {})) todas.add(rub);
  for (const rc of rcs) for (const c of rc.commitments) todas.add(c.rubrica);
  for (const pg of pagamentos) if (pg.rubrica) todas.add(pg.rubrica);
  return [...todas]
    .filter((r) => r.trim() !== "")
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}
