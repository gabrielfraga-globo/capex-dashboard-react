import type { ReactNode } from "react";
import { fmtBRL, fmtPct } from "../../lib/format";
import type { SegmentoTorre, Torre } from "./torres";

interface ExecucaoTorresProps {
  torre2026: Torre;
  torre2027: Torre | null;
  mostrar2027: boolean;
  onToggle2027: () => void;
  conciliacao?: { valor: number; material: boolean };
}

const ESTILO_SEGMENTO: Record<SegmentoTorre["chave"], string> = {
  realizado: "bg-info",
  emPagamento: "bg-ok",
  comp26Firme: "bg-violet-500",
  comp26Risco:
    "bg-violet-500 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.45)_0_2px,transparent_2px_6px)] border border-warn",
  comp27: "bg-violet-500",
  folga: "border border-dashed border-text-faint",
  aContratar: "border border-dashed border-text-faint",
  excesso: "bg-crit",
};

/** Barra 100% = BG. Quando o ocupado passa do BG, a escala cresce até o ocupado e o trecho além da marca fica destacado. */
function BarraTorre({ torre }: { torre: Torre }) {
  const escala = Math.max(torre.base, torre.ocupado);
  const pctDaEscala = (valor: number) => (escala > 0 ? (valor / escala) * 100 : 0);
  const marca = pctDaEscala(torre.base);
  const segmentos = torre.segmentos.filter((s) => s.chave !== "excesso");
  const descricao =
    `Torre ${torre.ano}: ` +
    torre.segmentos.map((s) => `${s.rotulo} ${fmtBRL(s.valor)}`).join(", ") +
    (torre.base > 0 ? `, BG ${fmtBRL(torre.base)}` : ", sem BG");

  return (
    <div role="img" aria-label={descricao} className="relative w-full">
      <div className="relative flex h-6 w-full overflow-hidden rounded-md bg-card-alt">
        {segmentos.map((seg) => (
          <div
            key={seg.chave}
            className={`h-full flex-none ${ESTILO_SEGMENTO[seg.chave]}`}
            style={{ width: `${pctDaEscala(seg.valor)}%` }}
          />
        ))}
        {torre.excesso > 0 && (
          <div
            className={`absolute inset-y-0 right-0 ${torre.excessoMaterial ? "bg-crit" : "bg-text-faint"}`}
            style={{ width: `${pctDaEscala(torre.excesso)}%` }}
          />
        )}
      </div>
      {torre.base > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-y-0.5 w-0.5 bg-text"
          style={{ left: `${marca}%` }}
        />
      )}
    </div>
  );
}

function valorSegmento(torre: Torre, chave: SegmentoTorre["chave"]): number {
  return torre.segmentos.find((s) => s.chave === chave)?.valor ?? 0;
}

function legenda2026(t: Torre): string {
  const realizado = valorSegmento(t, "realizado");
  const emPgto = valorSegmento(t, "emPagamento");
  const risco = valorSegmento(t, "comp26Risco");
  const comp26 = risco + valorSegmento(t, "comp26Firme");
  const partes: string[] = [];
  if (realizado > 0) partes.push(`Realizado ${fmtBRL(realizado, true)}`);
  if (emPgto > 0) partes.push(`Em pgto ${fmtBRL(emPgto, true)}`);
  if (comp26 > 0) {
    partes.push(`Comp. 26 ${fmtBRL(comp26, true)}${risco > 0 ? ` (${fmtBRL(risco, true)} em risco)` : ""}`);
  }
  if (t.folga > 0) partes.push(`folga ${fmtBRL(t.folga, true)}`);
  return partes.join(" · ");
}

function legenda2027(t: Torre): string {
  const partes: string[] = [];
  const comp27 = valorSegmento(t, "comp27");
  const aContratar = valorSegmento(t, "aContratar");
  if (comp27 > 0) partes.push(`Compromisso 27 ${fmtBRL(comp27, true)}`);
  if (aContratar > 0) partes.push(`a contratar ${fmtBRL(aContratar, true)}`);
  return partes.join(" · ");
}

function tituloTorre2026(t: Torre): ReactNode {
  const fim = t.excesso > 0
    ? t.excessoMaterial
      ? <span className="text-risk-critico">{`${fmtBRL(t.excesso, true)} acima do BG`}</span>
      : "no limite do BG"
    : `folga ${fmtBRL(t.folga, true)}`;
  return <>{`2026 · ${fmtPct(t.pctOcupado)} do BG · `}{fim}</>;
}

function tituloTorre2027(t: Torre): ReactNode {
  return (
    <>
      {`2027 · ${fmtPct(t.pctOcupado)} do BG 27 · Compromisso 27 alinhado com os times (cadastro)`}
      {t.excessoMaterial && <span className="text-risk-critico">{` · ${fmtBRL(t.excesso, true)} acima do BG 27`}</span>}
    </>
  );
}

function BlocoTorre({ titulo, legenda, torre }: { titulo: ReactNode; legenda: string; torre: Torre }) {
  return (
    <section className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold tabular-nums">{titulo}</p>
      <BarraTorre torre={torre} />
      {legenda && <p className="text-[11px] text-text-muted tabular-nums">{legenda}</p>}
    </section>
  );
}

export function ExecucaoTorres({ torre2026, torre2027, mostrar2027, onToggle2027, conciliacao }: ExecucaoTorresProps) {
  const conciliacaoValor = conciliacao?.valor ?? 0;
  return (
    <article className="flex shrink-0 flex-col gap-4 rounded-card border border-border bg-card p-4 text-text shadow-card">
      <header className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">EXECUÇÃO DO PLANO</p>
        <button
          type="button"
          aria-pressed={mostrar2027}
          onClick={onToggle2027}
          className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-text-muted transition-colors hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-info aria-pressed:border-info aria-pressed:bg-info-10 aria-pressed:text-info"
        >
          {mostrar2027 ? "− 2027" : "+ 2027"}
        </button>
      </header>

      <BlocoTorre titulo={tituloTorre2026(torre2026)} legenda={legenda2026(torre2026)} torre={torre2026} />

      {mostrar2027 && torre2027 && (
        <BlocoTorre titulo={tituloTorre2027(torre2027)} legenda={legenda2027(torre2027)} torre={torre2027} />
      )}

      {conciliacao?.material && (
        <p className="text-[11px] text-text-muted tabular-nums">
          {conciliacaoValor >= 0
            ? `${fmtBRL(conciliacaoValor, true)} emitidos ainda sem classificação 26/27.`
            : `${fmtBRL(-conciliacaoValor, true)} classificados em 26/27 acima do emitido da carteira.`}
        </p>
      )}
    </article>
  );
}
