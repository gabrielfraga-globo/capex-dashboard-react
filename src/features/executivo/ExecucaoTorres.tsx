import type { ReactNode } from "react";
import { fmtBRL, fmtPct } from "../../lib/format";
import { InfoTooltip } from "../../components/ui/primitives";
import type { SegmentoTorre, Torre } from "./torres";

interface ExecucaoTorresProps {
  torre2026: Torre;
  torre2027: Torre | null;
  mostrar2027: boolean;
  onToggle2027: () => void;
  conciliacao?: { valor: number; material: boolean };
  comp27?: number;
}

const ESTILO_SEGMENTO: Record<SegmentoTorre["chave"], string> = {
  realizado: "bg-info text-white",
  emPagamento: "bg-ok text-white",
  comp26Firme: "bg-violet-500 text-white",
  comp26Risco:
    "bg-[repeating-linear-gradient(135deg,theme(colors.violet.500)_0_4px,theme(colors.crit.DEFAULT)_4px_8px)] text-white",
  comp27: "bg-violet-500 text-white",
  folga: "border-2 border-ok",
  aContratar: "border border-dashed border-text-faint",
  excesso: "bg-warn",
};

const NOME_SEGMENTO: Record<SegmentoTorre["chave"], string> = {
  realizado: "Pago",
  emPagamento: "Em pagamento",
  comp26Firme: "Comprometido",
  comp26Risco: "Em risco",
  comp27: "Compromisso 27",
  folga: "Delta",
  aContratar: "A contratar",
  excesso: "Excesso",
};

const LIMITE_ROTULO_INTERNO = 8;

const TITULO_COMPROMETIDO =
  "Comprometido 26 sem risco: RC com OC emitida, entrega no prazo e pagamento previsto até 31/12.";
const TITULO_EM_RISCO =
  "Parte do Comprometido 26: RC sem OC emitida, entrega atrasada ou previsão incerta na curadoria. O declarado para 2027 não está aqui: vai para a torre 2027.";

/** Barra 100% = BG. Quando o ocupado passa do BG, a escala cresce até o ocupado e o trecho além da marca fica em âmbar. */
function BarraTorre({ torre, delta }: { torre: Torre; delta?: number }) {
  const escala = Math.max(torre.base, torre.ocupado);
  const pctDaEscala = (valor: number) => (escala > 0 ? (valor / escala) * 100 : 0);
  const pctDoBg = (valor: number) => (torre.base > 0 ? valor / torre.base : 0);
  const marca = pctDaEscala(torre.base);
  const segmentos = torre.segmentos.filter((s) => s.chave !== "excesso" && s.valor > 0);
  const maior = segmentos
    .filter((s) => s.chave !== "folga")
    .reduce<SegmentoTorre | null>((m, s) => (!m || s.valor > m.valor ? s : m), null);
  const descricao =
    `Torre ${torre.ano}: ` +
    torre.segmentos.map((s) => `${s.rotulo} ${fmtBRL(s.valor)}`).join(", ") +
    (torre.base > 0 ? `, BG ${fmtBRL(torre.base)}` : ", sem BG");

  const rotuloDelta =
    delta === undefined || delta === 0
      ? null
      : `Delta ${delta > 0 ? "+" : "−"}${fmtBRL(Math.abs(delta), true)} ▾`;
  const deltaPositivo = (delta ?? 0) >= 0;

  return (
    <div role="img" aria-label={descricao} className={`relative w-full ${rotuloDelta ? "pt-4" : ""}`}>
      {rotuloDelta && (
        <span
          className={`absolute right-0 top-0 whitespace-nowrap text-[11px] font-bold tabular-nums ${deltaPositivo ? "text-ok" : "text-warn"}`}
        >
          {rotuloDelta}
        </span>
      )}
      <div className="relative">
        <div className="relative flex h-6 w-full overflow-hidden rounded-md bg-card-alt">
          {segmentos.map((seg) => {
            const pct = pctDaEscala(seg.valor);
            const pctBg = fmtPct(pctDoBg(seg.valor), 0);
            const rotulo =
              seg === maior && pct >= LIMITE_ROTULO_INTERNO
                ? `${fmtBRL(seg.valor, true)} · ${pctBg}`
                : pct >= LIMITE_ROTULO_INTERNO && seg.chave !== "folga"
                  ? pctBg
                  : null;
            return (
              <div
                key={seg.chave}
                title={`${NOME_SEGMENTO[seg.chave]}: ${fmtBRL(seg.valor, true)} (${pctBg} do BG)`}
                className={`flex h-full flex-none items-center justify-center overflow-hidden whitespace-nowrap text-[11px] font-semibold tabular-nums ${ESTILO_SEGMENTO[seg.chave]}`}
                style={{ width: `${pct}%` }}
              >
                {rotulo}
              </div>
            );
          })}
          {torre.excesso > 0 && (
            <div
              title={`Excesso: ${fmtBRL(torre.excesso, true)} (${fmtPct(pctDoBg(torre.excesso), 0)} do BG)`}
              className={`absolute inset-y-0 right-0 ${ESTILO_SEGMENTO.excesso}`}
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
    </div>
  );
}

function valorSegmento(torre: Torre, chave: SegmentoTorre["chave"]): number {
  return torre.segmentos.find((s) => s.chave === chave)?.valor ?? 0;
}

function legenda2027(t: Torre): string {
  const partes: string[] = [];
  const comp27 = valorSegmento(t, "comp27");
  const aContratar = valorSegmento(t, "aContratar");
  if (comp27 > 0) partes.push(`Compromisso 27 ${fmtBRL(comp27, true)}`);
  if (aContratar > 0) partes.push(`a contratar ${fmtBRL(aContratar, true)}`);
  return partes.join(" · ");
}

function MetricaPrincipal2026({ torre }: { torre: Torre }) {
  const delta = torre.excesso > 0 ? -torre.excesso : torre.folga;
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="flex flex-col">
        <p className="text-[11px] font-semibold tracking-wide text-text-muted">DELTA VS BG 26</p>
        <p className={`text-[38px] font-extrabold leading-none tabular-nums ${delta >= 0 ? "text-ok" : "text-warn"}`}>
          {`${delta >= 0 ? "+" : "−"}${fmtBRL(Math.abs(delta), true)}`}
        </p>
      </div>
      <div className="flex flex-col items-end text-right">
        <p className="text-[11px] font-semibold tracking-wide text-text-muted">EXECUTADO + COMPROMETIDO</p>
        <p className="text-[20px] font-bold leading-tight tabular-nums">{fmtPct(torre.pctOcupado)}</p>
        <p className="text-[11px] text-text-muted tabular-nums">do BG {fmtBRL(torre.base, true)}</p>
      </div>
    </div>
  );
}

function LegendaTorre2026() {
  return (
    <ul className="flex flex-nowrap items-center gap-3 whitespace-nowrap text-[11px] text-text-muted">
      <li className="flex items-center gap-1">
        <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${ESTILO_SEGMENTO.realizado}`} />
        Pago
      </li>
      <li className="flex items-center gap-1">
        <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${ESTILO_SEGMENTO.emPagamento}`} />
        Em pagamento
      </li>
      <li className="flex items-center gap-1" title={TITULO_COMPROMETIDO}>
        <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${ESTILO_SEGMENTO.comp26Firme}`} />
        Comprometido
      </li>
      <li className="flex items-center gap-1" title={TITULO_EM_RISCO}>
        <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${ESTILO_SEGMENTO.comp26Risco}`} />
        Em risco
      </li>
      <li className="flex items-center gap-1 font-bold text-text">
        <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${ESTILO_SEGMENTO.folga}`} />
        Delta
      </li>
    </ul>
  );
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

export function ExecucaoTorres({ torre2026, torre2027, mostrar2027, onToggle2027, conciliacao, comp27 = 0 }: ExecucaoTorresProps) {
  const conciliacaoValor = conciliacao?.valor ?? 0;
  const delta = torre2026.excesso > 0 ? -torre2026.excesso : torre2026.folga;
  return (
    <article className="flex shrink-0 flex-col gap-4 rounded-card border border-border bg-card p-4 text-text shadow-card">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">EXECUÇÃO DO PLANO · 2026</p>
          <InfoTooltip
            label="Como é calculada a execução do plano"
            text="Pago + Em pagamento + Comprometido 26 sobre o BG 26. Comprometido 26 = RCs com pagamento previsto até 31/12."
          />
        </div>
        <button
          type="button"
          aria-pressed={mostrar2027}
          onClick={onToggle2027}
          className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-text-muted transition-colors hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-info aria-pressed:border-info aria-pressed:bg-info-10 aria-pressed:text-info"
        >
          {mostrar2027 ? "− 2027" : "+ 2027"}
        </button>
      </header>

      <MetricaPrincipal2026 torre={torre2026} />

      <section className="flex flex-col gap-1.5">
        <BarraTorre torre={torre2026} delta={delta} />
        <LegendaTorre2026 />
        {!mostrar2027 && comp27 > 0 && (
          <button
            type="button"
            onClick={onToggle2027}
            className="self-start text-[11px] font-semibold text-info hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-info"
          >
            {`${fmtBRL(comp27, true)} postergados para 2027 pelos times ›`}
          </button>
        )}
      </section>

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
