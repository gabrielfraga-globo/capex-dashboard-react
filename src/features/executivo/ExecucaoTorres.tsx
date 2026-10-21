import { useLayoutEffect, useRef, useState } from "react";
import { fmtBRL, fmtPct } from "../../lib/format";
import { InfoTooltip } from "../../components/ui/primitives";
import type { SegmentoTorre, Torre } from "./torres";

interface ExecucaoTorresProps {
  torre2026: Torre;
  torre2027: Torre | null;
  mostrar2027: boolean;
  onToggle2027: () => void;
  onOpenRisco?: () => void;
  conciliacao?: { valor: number; material: boolean };
  comp27?: number;
}

const ESTILO_SEGMENTO: Record<SegmentoTorre["chave"], string> = {
  realizado: "bg-blue-600 text-white",
  emPagamento: "bg-blue-400 text-white",
  comp26Firme: "bg-blue-200 text-blue-900",
  comp26Risco:
    "bg-crit-10 bg-[repeating-linear-gradient(135deg,theme(colors.crit.DEFAULT)_0_5px,transparent_5px_10px)] text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]",
  comp27: "bg-blue-200 text-blue-900",
  folga: "",
  aContratar: "",
  excesso: "bg-warn",
};

const NOME_SEGMENTO: Record<SegmentoTorre["chave"], string> = {
  realizado: "Pago",
  emPagamento: "Em pagamento",
  comp26Firme: "Comprometido",
  comp26Risco: "Em risco",
  comp27: "Comprometido 27",
  folga: "Folga",
  aContratar: "A contratar",
  excesso: "Acima do BG",
};

/** Largura mínima (% da barra) para exibir o rótulo dentro do trecho. */
const LIMITE_ROTULO_INTERNO = 8;
/** Largura mínima (% da barra) para o rótulo trazer o nome do segmento, p.ex. "Em risco 10%". */
const LIMITE_ROTULO_NOMEADO = 20;

/** Trechos que aparecem na barra; folga e "a contratar" são vazio. */
const CHAVES_PREENCHIDAS: SegmentoTorre["chave"][] = ["realizado", "emPagamento", "comp26Firme", "comp26Risco", "comp27"];

/** Rótulo do trecho: some quando o texto é mais largo que o trecho. Fica `invisible` (e não removido) para continuar medível. */
function RotuloTrecho({ texto }: { texto: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [cabe, setCabe] = useState(true);

  useLayoutEffect(() => {
    const span = ref.current;
    const trecho = span?.parentElement;
    if (!span || !trecho) return;
    const medir = () => setCabe(span.scrollWidth <= trecho.clientWidth);
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(trecho);
    return () => observer.disconnect();
  }, [texto]);

  return (
    <span ref={ref} className={cabe ? undefined : "invisible"}>
      {texto}
    </span>
  );
}

/** Barra 100% = BG. Quando o ocupado passa do BG, a escala cresce até o ocupado e o trecho além da marca fica em âmbar. */
function BarraTorre({ torre, onOpenRisco }: { torre: Torre; onOpenRisco?: () => void }) {
  const escala = Math.max(torre.base, torre.ocupado);
  const pctDaEscala = (valor: number) => (escala > 0 ? (valor / escala) * 100 : 0);
  const pctDoBg = (valor: number) => (torre.base > 0 ? valor / torre.base : 0);
  const marca = pctDaEscala(torre.base);
  const segmentos = torre.segmentos.filter((s) => CHAVES_PREENCHIDAS.includes(s.chave) && s.valor > 0);

  return (
    <div className="relative w-full">
      <div className="relative">
        <div className="relative flex h-12 w-full overflow-hidden rounded-md bg-card-alt">
          {segmentos.map((seg) => {
            const pct = pctDaEscala(seg.valor);
            const titulo = `${NOME_SEGMENTO[seg.chave]}: ${fmtBRL(seg.valor, true)}`;
            const rotuloPct = fmtPct(pctDoBg(seg.valor), 0);
            const rotulo =
              pct >= LIMITE_ROTULO_INTERNO
                ? (seg.chave === "realizado" || seg.chave === "comp26Risco") && pct >= LIMITE_ROTULO_NOMEADO
                  ? `${NOME_SEGMENTO[seg.chave]} ${rotuloPct}`
                  : rotuloPct
                : null;
            const classes = `flex h-full flex-none items-center justify-center overflow-hidden whitespace-nowrap text-xs font-semibold tabular-nums ${ESTILO_SEGMENTO[seg.chave]}`;
            if (seg.chave === "comp26Risco" && onOpenRisco) {
              return (
                <button
                  key={seg.chave}
                  type="button"
                  title={`${titulo} · ver projetos em risco`}
                  onClick={onOpenRisco}
                  className={`${classes} cursor-pointer transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-text`}
                  style={{ width: `${pct}%` }}
                >
                  {rotulo && <RotuloTrecho texto={rotulo} />}
                </button>
              );
            }
            return (
              <div key={seg.chave} title={titulo} className={classes} style={{ width: `${pct}%` }}>
                {rotulo && <RotuloTrecho texto={rotulo} />}
              </div>
            );
          })}
          {torre.excesso > 0 && (
            <div
              title={`Acima do BG: ${fmtBRL(torre.excesso, true)}`}
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

function MetricaPrincipal2026({ torre }: { torre: Torre }) {
  const acimaDoBg = (torre.pctOcupado ?? 0) > 1;
  return (
    <div className="flex flex-col">
      <p className={`text-[48px] font-extrabold leading-none tabular-nums ${acimaDoBg ? "text-warn" : ""}`}>
        {fmtPct(torre.pctOcupado)}
      </p>
      <p className="text-sm text-text-muted">do BG 26 provisionado</p>
    </div>
  );
}

function LegendaTorre2026() {
  const itens: { chave: SegmentoTorre["chave"]; rotulo: string }[] = [
    { chave: "realizado", rotulo: "Pago" },
    { chave: "emPagamento", rotulo: "Em pagamento" },
    { chave: "comp26Firme", rotulo: "Comprometido" },
    { chave: "comp26Risco", rotulo: "Em risco" },
  ];
  return (
    <ul className="flex flex-nowrap items-center gap-3 whitespace-nowrap text-[11px] text-text-muted">
      {itens.map((item) => (
        <li key={item.chave} className="flex items-center gap-1">
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${ESTILO_SEGMENTO[item.chave]}`} />
          {item.rotulo}
        </li>
      ))}
    </ul>
  );
}

function ConteudoInfo2026({
  torre,
  comp27,
  conciliacao,
}: {
  torre: Torre;
  comp27: number;
  conciliacao?: { valor: number; material: boolean };
}) {
  const linhas: string[] = [
    `Pago + Em pagamento + Comprometido 26 sobre o BG 26 (${fmtBRL(torre.base, true)})`,
    torre.excesso > 0
      ? `Acima do BG: ${fmtBRL(torre.excesso, true)}`
      : `Folga até o BG: ${fmtBRL(torre.folga, true)}`,
  ];
  if (comp27 > 0) linhas.push(`${fmtBRL(comp27, true)} postergados para 2027 pelos times`);
  if (conciliacao?.material && conciliacao.valor > 0) {
    linhas.push(`${fmtBRL(conciliacao.valor, true)} emitidos sem classificação 26/27`);
  }
  return (
    <ul className="flex flex-col gap-1">
      {linhas.map((linha) => (
        <li key={linha}>{linha}</li>
      ))}
    </ul>
  );
}

function BlocoTorre2027({ torre }: { torre: Torre }) {
  return (
    <section className="flex flex-col gap-1.5">
      <p className="text-sm tabular-nums">
        <span className="font-bold">{fmtPct(torre.pctOcupado)}</span>
        {" do BG 27 comprometido"}
        {torre.excessoMaterial && (
          <span className="text-warn">{` · ${fmtBRL(torre.excesso, true)} acima do BG 27`}</span>
        )}
      </p>
      <BarraTorre torre={torre} />
    </section>
  );
}

export function ExecucaoTorres({
  torre2026,
  torre2027,
  mostrar2027,
  onToggle2027,
  onOpenRisco,
  conciliacao,
  comp27 = 0,
}: ExecucaoTorresProps) {
  return (
    <article className="flex h-full min-h-0 flex-col gap-4 rounded-card border border-border bg-card p-4 text-text shadow-card">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">EXECUÇÃO DO PLANO · 2026</p>
          <InfoTooltip
            label="Como é calculada a execução do plano"
            content={<ConteudoInfo2026 torre={torre2026} comp27={comp27} conciliacao={conciliacao} />}
          />
        </div>
        <button
          type="button"
          aria-pressed={mostrar2027}
          onClick={onToggle2027}
          className="h-4 rounded-md border border-border px-2 py-0 text-[11px] leading-none font-semibold text-text-muted transition-colors hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-info aria-pressed:border-info aria-pressed:bg-info-10 aria-pressed:text-info"
        >
          {mostrar2027 ? "− 2027" : "+ 2027"}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-4">
        <MetricaPrincipal2026 torre={torre2026} />

        <section className="flex flex-col gap-1.5">
          <BarraTorre torre={torre2026} onOpenRisco={onOpenRisco} />
          <LegendaTorre2026 />
        </section>

        {mostrar2027 && torre2027 && <BlocoTorre2027 torre={torre2027} />}
      </div>
    </article>
  );
}
