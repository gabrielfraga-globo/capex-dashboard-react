import type { OperationalRow } from "../radar/operational";

export interface LinhaExplicacao {
  rotulo: string;
  valor: number;
  qtd: number;
}

export interface ExplicacaoCompromisso {
  total: number;
  linhas: LinhaExplicacao[];
}

// Mesmo filtro de etapa e mesmo campo de valor de buildBgVivo (radar/executive.ts, ramos 2026 e 2027).
function contaNoRadar(r: OperationalRow): boolean {
  return r.stage !== "DESCONHECIDA" && r.stage !== "RESIDUAL";
}

const ROTULO_EM_RISCO = "Em risco (incluído no 26)";
const ROTULO_DECISAO = "Decisão do gestor";
const ROTULO_PAGAMENTO_26 = "Pagamento estimado até 31/12";
const ROTULO_SEM_DATA = "Sem data prevista";
const ROTULO_PAGAMENTO_27 = "Pagamento estimado após 31/12";

const ORDEM_26 = [ROTULO_EM_RISCO, ROTULO_DECISAO, ROTULO_PAGAMENTO_26];
const ORDEM_27 = [ROTULO_DECISAO, ROTULO_SEM_DATA, ROTULO_PAGAMENTO_27];

function rotuloCompromisso26(r: OperationalRow): string | null {
  if (!contaNoRadar(r)) return null;
  if (r.classification === "EM_RISCO") return ROTULO_EM_RISCO;
  if (r.classification === "CAIXA_26") {
    return r.isClassificationConfirmed ? ROTULO_DECISAO : ROTULO_PAGAMENTO_26;
  }
  return null;
}

function rotuloCompromisso27(r: OperationalRow): string | null {
  if (!contaNoRadar(r) || r.classification !== "CAIXA_27") return null;
  if (r.isClassificationConfirmed) return ROTULO_DECISAO;
  return r.suggestedPaymentDate ? ROTULO_PAGAMENTO_27 : ROTULO_SEM_DATA;
}

// Soma em centavos inteiros para que Σ linhas seja exatamente igual ao total.
function explicar(
  rows: OperationalRow[],
  ordem: string[],
  rotuloDe: (r: OperationalRow) => string | null,
): ExplicacaoCompromisso {
  const baldes = new Map(ordem.map((rotulo) => [rotulo, { cents: 0, qtd: 0 }]));
  let totalCents = 0;
  for (const r of rows) {
    const rotulo = rotuloDe(r);
    if (!rotulo) continue;
    const cents = Math.round(r.value * 100);
    const balde = baldes.get(rotulo)!;
    balde.cents += cents;
    balde.qtd += 1;
    totalCents += cents;
  }
  const linhas: LinhaExplicacao[] = [];
  for (const rotulo of ordem) {
    const { cents, qtd } = baldes.get(rotulo)!;
    if (cents !== 0) linhas.push({ rotulo, valor: cents / 100, qtd });
  }
  return { total: totalCents / 100, linhas };
}

export function explicarCompromissoExercicio(
  rows: OperationalRow[],
  _exerciseYear: number,
): { c26: ExplicacaoCompromisso; c27: ExplicacaoCompromisso } {
  return {
    c26: explicar(rows, ORDEM_26, rotuloCompromisso26),
    c27: explicar(rows, ORDEM_27, rotuloCompromisso27),
  };
}

// dd/mm a partir da data local (sem conversão para UTC).
export function formatarDiaMes(data: Date): string {
  const dd = String(data.getDate()).padStart(2, "0");
  const mm = String(data.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

// Data em que RCs em aprovação/cotação passam a cair no exercício seguinte: 31/12 − dias + 1.
// Date.UTC evita efeitos de horário de verão no cálculo.
export function fraseVirada(referencia: Date, exerciseYear: number, dias: number): string {
  const virada = new Date(Date.UTC(exerciseYear, 11, 31 - dias + 1));
  const dataVirada = formatarDiaMes(new Date(virada.getUTCFullYear(), virada.getUTCMonth(), virada.getUTCDate()));
  const refDia = Date.UTC(referencia.getFullYear(), referencia.getMonth(), referencia.getDate());
  const proximo = exerciseYear + 1;
  if (refDia < virada.getTime()) {
    return `RCs em aprovação ou cotação usam hoje + ${dias} dias: a partir de ${dataVirada} passam sozinhas para ${proximo}.`;
  }
  return `Desde ${dataVirada}, RCs em aprovação ou cotação entram em ${proximo} automaticamente (hoje + ${dias} dias).`;
}
