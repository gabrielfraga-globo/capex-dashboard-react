import { fmtBRL, fmtPct } from "../../lib/format";
import type { PressaoFolga } from "../saldo/saldo";
import type { KpisExecutivos } from "./types";

const DESVIO_MINIMO_NARRATIVA = 100_000;

const money = (v: number): string => fmtBRL(v, true);

const plural = (n: number): string => `${n} ${n === 1 ? "projeto" : "projetos"}`;

export function buildNarrativaExecutiva(k: KpisExecutivos): string {
  const frases: string[] = [];
  const folga = k.folgaParada ?? 0;

  if (k.pctCaixa !== null) {
    let f = `Caixa em ${fmtPct(k.pctCaixa)} do orçamento`;
    if (k.desvioPlano !== null && Math.abs(k.desvioPlano) >= DESVIO_MINIMO_NARRATIVA) {
      f += ` e ${money(Math.abs(k.desvioPlano))} ${k.desvioPlano > 0 ? "à frente" : "atrás"} do plano`;
    }
    frases.push(`${f}.`);
  }

  if (k.excesso > 0) {
    let f = `O comprometido passa o orçamento em ${money(k.excesso)}`;
    if (folga > 0) {
      const cobertura = folga / k.excesso;
      f +=
        cobertura >= 1
          ? `; ${money(folga)} parados há 6+ meses cobrem todo o excesso`
          : `; ${money(folga)} parados há 6+ meses cobrem ${fmtPct(cobertura)} disso`;
    }
    frases.push(`${f}.`);
  } else if (k.pctComprometido !== null) {
    let f = `O comprometido está em ${fmtPct(k.pctComprometido)} do orçamento`;
    if (folga > 0) f += ` e há ${money(folga)} parados para remanejar`;
    frases.push(`${f}.`);
  } else if (folga > 0) {
    frases.push(`Há ${money(folga)} parados para remanejar.`);
  }

  return frases.join(" ");
}

export function buildNarrativaRisco(p: PressaoFolga): string {
  const folga = p.folgaParada;

  if (p.pressao > 0) {
    let f = `${money(p.pressao)} comprometidos acima do orçamento em ${plural(p.projetosPressao)}`;
    if (folga > 0 && p.cobertura !== null) {
      const cobertura =
        p.cobertura >= 1 ? "cobrem toda essa pressão" : `cobrem ${fmtPct(p.cobertura)} dessa pressão`;
      f += `. ${money(folga)} parados em ${plural(p.projetosParados)} ${cobertura}`;
    }
    return `${f}.`;
  }

  let f = "Nenhum projeto comprometido acima do orçamento";
  if (folga > 0) f += `; ${money(folga)} parados em ${plural(p.projetosParados)} podem ser remanejados`;
  return `${f}.`;
}
