import { LIMIAR_MATERIALIDADE } from "../../lib/metrics";

export interface SegmentoTorre {
  chave: "realizado" | "emPagamento" | "comp26Firme" | "comp26Risco" | "folga" | "comp27" | "aContratar" | "excesso";
  rotulo: string;
  valor: number;
  pctBase: number;
}

export interface Torre {
  ano: 2026 | 2027;
  base: number;
  ocupado: number;
  pctOcupado: number | null;
  folga: number;
  excesso: number;
  excessoMaterial: boolean;
  segmentos: SegmentoTorre[];
}

const nn = (v: number | null | undefined): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

function montarTorre(
  ano: 2026 | 2027,
  base: number,
  candidatos: Omit<SegmentoTorre, "pctBase">[],
  rotuloLivre: { chave: "folga" | "aContratar"; rotulo: string },
): Torre {
  const ocupado = candidatos.reduce((s, seg) => s + seg.valor, 0);
  const folga = Math.max(0, base - ocupado);
  const excesso = Math.max(0, ocupado - base);
  const excessoMaterial = excesso >= LIMIAR_MATERIALIDADE;
  const pct = (valor: number) => (base > 0 ? valor / base : 0);

  const segmentos: SegmentoTorre[] = candidatos
    .filter((seg) => seg.valor > 0)
    .map((seg) => ({ ...seg, pctBase: pct(seg.valor) }));

  if (excesso > 0) {
    segmentos.push({ chave: "excesso", rotulo: "Acima do BG", valor: excesso, pctBase: pct(excesso) });
  } else if (folga > 0) {
    segmentos.push({ chave: rotuloLivre.chave, rotulo: rotuloLivre.rotulo, valor: folga, pctBase: pct(folga) });
  }

  return {
    ano,
    base,
    ocupado,
    pctOcupado: base > 0 ? ocupado / base : null,
    folga,
    excesso,
    excessoMaterial,
    segmentos,
  };
}

export function buildTorre2026(i: { bg: number; realizado: number; emPagamento: number; comp26: number; emRisco: number }): Torre {
  const base = nn(i.bg);
  const realizado = nn(i.realizado);
  const emPagamento = nn(i.emPagamento);
  const comp26 = nn(i.comp26);
  const emRisco = Math.min(nn(i.emRisco), comp26);
  const comp26Firme = comp26 - emRisco;

  return montarTorre(
    2026,
    base,
    [
      { chave: "realizado", rotulo: "Realizado 26", valor: realizado },
      { chave: "emPagamento", rotulo: "Em pagamento", valor: emPagamento },
      { chave: "comp26Firme", rotulo: "Compromisso 26 firme", valor: comp26Firme },
      { chave: "comp26Risco", rotulo: "Compromisso 26 em risco", valor: emRisco },
    ],
    { chave: "folga", rotulo: "Folga" },
  );
}

export function buildTorre2027(i: { bg: number; comp27: number }): Torre {
  return montarTorre(
    2027,
    nn(i.bg),
    [{ chave: "comp27", rotulo: "Compromisso 27", valor: nn(i.comp27) }],
    { chave: "aContratar", rotulo: "A contratar" },
  );
}

export function conciliacaoEmitido(i: { emitidoCarteira: number; comp26: number; comp27: number }): { valor: number; material: boolean } {
  const valor = nn(i.emitidoCarteira) - nn(i.comp26) - nn(i.comp27);
  return { valor, material: Math.abs(valor) >= LIMIAR_MATERIALIDADE };
}
