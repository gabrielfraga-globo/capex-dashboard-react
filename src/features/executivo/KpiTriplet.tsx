import { Card, InfoTooltip } from "../../components/ui/primitives";
import { fmtBRL, fmtPct } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { KpisExecutivos } from "./types";

const LIMIAR_DESVIO = 100_000;

const plural = (n: number): string => `${n} ${n === 1 ? "projeto" : "projetos"}`;

const sinal = (v: number): string => `${v < 0 ? "−" : "+"}${fmtBRL(Math.abs(v), true)}`;

function Valor({ v, className }: { v: number | null; className?: string }) {
  return (
    <span className={className} title={fmtBRL(v)}>
      {fmtBRL(v, true)}
    </span>
  );
}

const rotulo = "flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted";

export function KpiTriplet({
  k,
  ano,
  onComprometidoClick,
}: {
  k: KpisExecutivos;
  ano: number;
  onComprometidoClick?: () => void;
}) {
  const temDesvio = k.desvioPlano !== null && Math.abs(k.desvioPlano) >= LIMIAR_DESVIO;
  const temExcesso = k.excesso > 0;

  const cardComprometido = (
    <Card>
      <div className={rotulo}>Comprometido</div>
      <div className="mt-1 text-2xl font-bold text-text">
        {fmtPct(k.pctComprometido)} <span className="text-base font-medium text-text-muted">do orçamento</span>
      </div>
      {temExcesso && (
        <div className="mt-1 text-sm font-semibold text-risk-critico" title={fmtBRL(k.excesso)}>
          ● {fmtBRL(k.excesso, true)} acima
        </div>
      )}
      {temExcesso && k.excessoSemLegado !== null && (
        <div className="text-[11px] text-text-faint" title={fmtBRL(k.excessoSemLegado)}>
          {fmtBRL(k.excessoSemLegado, true)} desconsiderando o legado (premissa)
        </div>
      )}
      {onComprometidoClick && (
        <div className="mt-2 text-xs font-medium text-accent">ver execução detalhada →</div>
      )}
    </Card>
  );

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <Card>
        <div className={rotulo}>
          Caixa {ano}
          <InfoTooltip text="Orçamento aprovado (BG Gov / BGQ3)" />
        </div>
        <div className="mt-1 text-2xl font-bold text-text">
          <Valor v={k.caixa} /> <span className="text-base font-medium text-text-muted">de</span>{" "}
          <Valor v={k.orcamento} className="text-base font-medium text-text-muted" />
        </div>
        <div className="mt-1 text-sm text-text">
          {fmtPct(k.pctCaixa)}
          {temDesvio && k.desvioPlano !== null && ` · ${sinal(k.desvioPlano)} vs plano`}
        </div>
        <div className="mt-1 text-[11px] text-text-faint">
          inclui <Valor v={k.emPagamento} /> em pagamento
        </div>
      </Card>

      {onComprometidoClick ? (
        <button
          type="button"
          onClick={onComprometidoClick}
          className={cn(
            "w-full rounded-card text-left transition-transform hover:-translate-y-0.5",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          )}
        >
          {cardComprometido}
        </button>
      ) : (
        cardComprometido
      )}

      <Card>
        <div className={rotulo}>Folga parada</div>
        {k.folgaParada === null ? (
          <>
            <div className="mt-1 text-2xl font-bold text-text">—</div>
            <div className="mt-1 text-[11px] text-text-faint">saldo de projetos indisponível</div>
          </>
        ) : (
          <>
            <Valor v={k.folgaParada} className="mt-1 block text-2xl font-bold text-text" />
            <div className="mt-1 text-[11px] text-text-faint">
              {plural(k.projetosParados ?? 0)} · 6+ meses sem compromisso
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
