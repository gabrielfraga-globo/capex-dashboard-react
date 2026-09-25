import type { CommitmentView, RcView } from "./types";

export function fornecedorDoCompromisso(commitment: Pick<CommitmentView, "supplier" | "projectName">): string {
  return commitment.supplier.trim() || commitment.projectName;
}

export function fornecedoresDaRc(rc: RcView): string[] {
  return Array.from(new Set(rc.commitments.map(fornecedorDoCompromisso))).sort((a, b) => a.localeCompare(b, "pt-BR"));
}
