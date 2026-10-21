import { useLayoutEffect, useRef, useState } from "react";
import { fmtBRL, fmtPct } from "../../lib/format";
import { InfoTooltip } from "../../components/ui/primitives";
import type { ResultadoPremissa } from "../../domain/metricas";

interface ExecucaoTorresProps {
  /** Total da premissa simples (carteira no recorte). */
  total: ResultadoPremissa;
  /** Σ orçamento 2027 da carteira no recorte. */
  bg27: number;
  /** Projetos com excesso sobre o orçamento 2026. */
  projetosAcima: number;
  mostrar2027: boolean;
  onToggle2027: () => void;
  onOpenRisco?: () => void;
}

type ChaveTrecho = "pago" | "emPagamento" | "comprometido" | "risco" | "declarado27" | "excesso";

interface TrechoBarra {
  chave: ChaveTrecho;
  valor: number;
  titulo?: string;
}

const ESTILO_TRECHO: Record<ChaveTrecho, string> = {
  pago: "bg-blue-600 text-white",
  emPagamento: "bg-blue-400 text-white",
  comprometido: "bg-blue-200 text-blue-900",
  risco:
    "bg-crit-10 bg-[repeating-linear-gradient(135deg,theme(colors.crit.DEFAULT)_0_5px,transparent_5px_10px)] text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]",
  declarado27: "bg-blue-200 text-blue-900",
  excesso: "bg-warn",
};

const NOME_TRECHO: Record<ChaveTrecho, string> = {
  pago: "Pago",
  emPagamento: "Em pagamento",
  comprometido: "Comprometido",
  risco: "Em risco",
  declarado27: "Declarado 2027",
  excesso: "Acima do orçamento",
};

/** Largura mínima (% da barra) para exibir o rótulo dentro do trecho. */
const LIMITE_ROTULO_INTERNO = 8;

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

/**
 * Barra: Pago | Em pagamento | Comprometido (com o trecho em risco hachurado no fim) | vazio até a marca do BG | excesso em âmbar além da marca.
 */
function BarraTorre({
  base,
  trechos,
  excesso = 0,
  onOpenRisco,
}: {
  base: number;
  trechos: TrechoBarra[];
  excesso?: number;
  onOpenRisco?: () => void;
}) {
  const ocupado = trechos.reduce((soma, t) => soma + t.valor, 0);
  const inicioExcesso = Math.max(base, ocupado);
  const escala = inicioExcesso + excesso;
  const pctDaEscala = (valor: number) => (escala > 0 ? (valor / escala) * 100 : 0);
  const pctDoBg = (valor: number) => (base > 0 ? valor / base : 0);
  const marca = pctDaEscala(base);
  const visiveis = trechos.filter((t) => t.valor > 0);

  return (
    <div className="relative w-full">
      <div className="relative">
        <div className="relative flex h-12 w-full overflow-hidden rounded-md bg-card-alt">
          {visiveis.map((seg) => {
            const pct = pctDaEscala(seg.valor);
            const titulo = seg.titulo ?? `${NOME_TRECHO[seg.chave]}: ${fmtBRL(seg.valor, true)}`;
            const rotulo = pct >= LIMITE_ROTULO_INTERNO ? fmtPct(pctDoBg(seg.valor), 0) : null;
            const classes = `flex h-full flex-none items-center justify-center overflow-hidden whitespace-nowrap text-xs font-semibold tabular-nums ${ESTILO_TRECHO[seg.chave]}`;
            if (seg.chave === "risco" && onOpenRisco) {
              return (
                <button
                  key={seg.chave}
                  type="button"
                  title={titulo}
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
          {excesso > 0 && (
            <div
              title={`Acima do orçamento: ${fmtBRL(excesso, true)}`}
              className={`absolute inset-y-0 ${ESTILO_TRECHO.excesso}`}
              style={{ left: `${pctDaEscala(inicioExcesso)}%`, width: `${pctDaEscala(excesso)}%` }}
            />
          )}
        </div>
        {base > 0 && (
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


function MetricaPrincipal2026({ total }: { total: ResultadoPremissa }) {
  const acimaDoBg = total.pctBG > 1;
  return (
    <div className="flex flex-col">
      <p className={`text-[48px] font-extrabold leading-none tabular-nums ${acimaDoBg ? "text-warn" : ""}`}>
        {fmtPct(total.pctBG)}
      </p>
      <p className="text-sm text-text-muted">do BG 26 coberto</p>
    </div>
  );
}

function LegendaTorre2026({ excesso }: { excesso: number }) {
  const itens: { chave: ChaveTrecho; rotulo: string }[] = [
    { chave: "pago", rotulo: "Pago" },
    { chave: "emPagamento", rotulo: "Em pagamento" },
    { chave: "comprometido", rotulo: "Comprometido" },
    { chave: "risco", rotulo: "Em risco" },
  ];
  if (excesso > 0) itens.push({ chave: "excesso", rotulo: "Acima do orçamento" });
  return (
    <ul className="flex flex-nowrap items-center gap-3 whitespace-nowrap text-[11px] text-text-muted">
      {itens.map((item) => (
        <li key={item.chave} className="flex items-center gap-1">
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${ESTILO_TRECHO[item.chave]}`} />
          {item.rotulo}
        </li>
      ))}
    </ul>
  );
}

function ConteudoInfo2026({ total, projetosAcima }: { total: ResultadoPremissa; projetosAcima: number }) {
  const semEmissao = Math.max(0, total.bg - total.provisionado);
  const linhas: string[] = [
    `Pago + em pagamento + emitido até o orçamento de cada projeto, sobre o BG 26 (${fmtBRL(total.bg, true)})`,
    `Sem emissão: ${fmtBRL(semEmissao, true)}`,
  ];
  if (total.excesso > 0) {
    const plural = projetosAcima === 1 ? "projeto" : "projetos";
    linhas.push(`Acima do orçamento: ${fmtBRL(total.excesso, true)} em ${projetosAcima} ${plural}`);
  }
  linhas.push(`Declarado 2027 pelos times: ${fmtBRL(total.declarado27, true)}`);
  return (
    <ul className="flex flex-col gap-1">
      {linhas.map((linha) => (
        <li key={linha}>{linha}</li>
      ))}
    </ul>
  );
}

function BlocoTorre2027({ bg27, declarado27 }: { bg27: number; declarado27: number }) {
  const pct = bg27 > 0 ? declarado27 / bg27 : 0;
  const excesso = Math.max(0, declarado27 - bg27);
  return (
    <section className="flex flex-col gap-1.5">
      <p className="text-sm tabular-nums">
        <span className="font-bold">{fmtPct(pct)}</span>
        {" do BG 27 declarado pelos times"}
        {excesso > 0 && <span className="text-warn">{` · ${fmtBRL(excesso, true)} acima do BG 27`}</span>}
      </p>
      <BarraTorre base={bg27} trechos={[{ chave: "declarado27", valor: declarado27 }]} excesso={excesso} />
    </section>
  );
}

export function ExecucaoTorres({
  total,
  bg27,
  projetosAcima,
  mostrar2027,
  onToggle2027,
  onOpenRisco,
}: ExecucaoTorresProps) {
  const comprometidoFirme = Math.max(0, total.comprometido - total.emRiscoSinal);
  const textoComprometidoFirme = `Comprometido com pedido: ${fmtBRL(comprometidoFirme, true)} de ${fmtBRL(total.comprometido, true)}`;
  const textoRisco = `Comprometido sem pedido (em risco): ${fmtBRL(total.emRiscoSinal, true)}`;
  return (
    <article className="flex h-full min-h-0 flex-col gap-3 rounded-card border border-border bg-card p-4 text-text shadow-card">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">EXECUÇÃO DO PLANO · 2026</p>
          <InfoTooltip
            label="Como é calculada a execução do plano"
            content={<ConteudoInfo2026 total={total} projetosAcima={projetosAcima} />}
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

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
        <MetricaPrincipal2026 total={total} />

        <section className="flex flex-col gap-1.5">
          <BarraTorre
            base={total.bg}
            trechos={[
              { chave: "pago", valor: total.pago },
              { chave: "emPagamento", valor: total.emPagamento },
              { chave: "comprometido", valor: comprometidoFirme, titulo: textoComprometidoFirme },
              { chave: "risco", valor: total.emRiscoSinal, titulo: textoRisco },
            ]}
            excesso={total.excesso}
            onOpenRisco={onOpenRisco}
          />
          <LegendaTorre2026 excesso={total.excesso} />
        </section>

        {mostrar2027 && <BlocoTorre2027 bg27={bg27} declarado27={total.declarado27} />}
      </div>
    </article>
  );
}

