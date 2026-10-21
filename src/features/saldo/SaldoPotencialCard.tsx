import { useMemo } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { AlertTriangle, ArrowRight, Info, ShieldAlert } from "lucide-react";
import { Button, Card } from "../../components/ui/primitives";
import { fmtBRL, fmtMilhoes, fmtPct } from "../../lib/format";
import { navigate } from "../../lib/simpleRouter";
import { LABELS } from "../../config/labels";
import type { SaldoRecorteView } from "../radar/types";
import { useSaldoProjetos } from "./useSaldoProjetos";
import { SALDO_LEGADO_MATERIAL } from "./saldoConfig";
import {
  aggregateSaldoBy,
  filterSaldoLinhas,
  mesesDesde,
  summarizeSaldo,
  topBySaldoPotencial,
} from "./saldo";

export interface SaldoPotencialCardProps {
  /** undefined = carteira toda */
  projectKeys?: ReadonlySet<string>;
  /** undefined ou vazio = todas as rubricas */
  rubricas?: string[];
  /** undefined = qualquer ano; se informado e diferente do exercício do saldo, o card não renderiza */
  anoSelecionado?: number;
  variant?: "compact" | "full" | "flip";
  topN?: number;
  onOpenDetail?: () => void;
  /** true = não renderiza o CTA "Ver risco de caixa →" (uso na própria página de detalhe) */
  hideCta?: boolean;
}

function formatDiaMes(iso: string): string {
  const [, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}`;
}

function textoUltimoCompromisso(meses: number | null, exercicio: number): string {
  if (meses === null) return `sem compromisso aprovado em ${exercicio}`;
  return `último compromisso há ${meses} ${meses === 1 ? "mês" : "meses"}`;
}

const CRITERIO_BI_SALDO =
  "Critério do BI (Saldo Projetos): orçamento BG Gov (BGQ3) − caixa do exercício − compromissos de RCs aprovadas no exercício. " +
  "Difere do KPI 'A emitir', que usa Fechamento estimado e Compromisso 26. Compromissos de RCs anteriores ao exercício são desconsiderados (premissa).";

/** Negativo que arredonda para zero viraria "R$ 0"; mostra "-R$ 1" para não ocultar o sinal. */
function fmtSaldo(v: number): string {
  if (v < 0 && Math.round(v) === 0) return "-R$ 1";
  return fmtMilhoes(v);
}

function SaldoBar({ caixa, compromisso, saldo, orcamento, saldoPotencial }: {
  caixa: number;
  compromisso: number;
  saldo: number;
  orcamento: number;
  saldoPotencial: number;
}) {
  const c = Math.max(0, caixa);
  const v = Math.max(0, compromisso);
  const s = Math.max(0, saldo);
  const acima = saldo < 0;
  const denom = c + v > orcamento ? c + v + s : orcamento;
  const pct = (x: number) => (denom > 0 ? (x / denom) * 100 : 0);
  const ariaLabel = `Caixa ${fmtBRL(c, true)}; compromisso válido ${fmtBRL(v, true)}; saldo disponível ${fmtSaldo(saldo)}${acima ? " (acima do orçamento)" : ""}; saldo potencial ${fmtBRL(saldoPotencial, true)}`;

  return (
    <div className="mt-3">
      <div role="img" aria-label={ariaLabel} className="flex h-2.5 w-full overflow-hidden rounded-full bg-card-alt">
        <div className="h-full bg-text-muted" style={{ width: `${pct(c)}%`, opacity: 0.95 }} />
        <div className="h-full bg-text-muted" style={{ width: `${pct(v)}%`, opacity: 0.6 }} />
        <div className="h-full bg-text-muted" style={{ width: `${pct(s)}%`, opacity: 0.3 }} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-faint" aria-hidden="true">
        <span>Caixa {fmtBRL(c, true)}</span>
        <span>Compromisso válido {fmtBRL(v, true)}</span>
        <span className={acima ? "font-semibold text-risk-critico" : undefined}>
          Saldo disponível {fmtSaldo(saldo)}{acima ? " (acima do orçamento)" : ""}
        </span>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="mb-4 rounded-card border border-border bg-card-alt p-4 animate-pulse" aria-live="polite" aria-busy="true">
      <div className="h-4 w-48 rounded bg-card mb-3" />
      <div className="h-8 w-40 rounded bg-card" />
      <div className="h-2.5 w-full rounded-full bg-card mt-3" />
    </div>
  );
}

/** Face "flip": mesma caixa e tipografia dos KPIs da faixa (KpiStat). */
const FLIP_BOX = "flex h-full flex-col justify-start gap-1 rounded-card border border-border bg-card px-4 py-3";

function SaldoFlipSkeleton() {
  return (
    <div className={`${FLIP_BOX} animate-pulse`} aria-live="polite" aria-busy="true">
      <div className="h-3 w-40 rounded bg-card-alt" />
      <div className="mt-1 h-7 w-28 rounded bg-card-alt" />
      <div className="mt-1 h-3 w-44 rounded bg-card-alt" />
    </div>
  );
}

function SaldoFlipView({ valor, contexto, onOpenDetail, hideCta }: {
  valor: string;
  contexto: string;
  onOpenDetail: () => void;
  hideCta: boolean;
}) {
  return (
    <div className={FLIP_BOX}>
      <div className="flex items-center gap-2">
        <ShieldAlert size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
        <span data-flip-title className="text-[12px] font-semibold leading-snug text-text-muted">
          {LABELS.saldoParadoCard}
        </span>
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="text-[28px] font-bold tabular-nums leading-none text-text">{valor}</div>
        {!hideCta && (
          <button type="button" onClick={onOpenDetail} className="shrink-0 pb-0.5 text-[11px] text-info hover:underline">
            Ver detalhe →
          </button>
        )}
      </div>
      <div className="mt-1 text-[11px] leading-tight text-text-faint">{contexto}</div>
    </div>
  );
}

export function SaldoPotencialCard({
  projectKeys,
  rubricas,
  anoSelecionado,
  variant = "compact",
  topN = 5,
  onOpenDetail = () => navigate("/risco-caixa"),
  hideCta = false,
}: SaldoPotencialCardProps) {
  const state = useSaldoProjetos();
  const cardClass = variant === "full" ? "mb-4" : "";

  const model = useMemo(() => {
    if (state.status !== "ready") return null;
    const { section } = state;
    const linhas = filterSaldoLinhas(section.linhas, { projectKeys, rubricas });
    const totals = summarizeSaldo(linhas);
    const views = aggregateSaldoBy(linhas, "projeto");
    const top = topBySaldoPotencial(views, topN);
    return { section, totals, top };
  }, [state, projectKeys, rubricas, topN]);

  if (state.status === "loading") return variant === "flip" ? <SaldoFlipSkeleton /> : <Skeleton />;

  if (state.status === "unavailable" || state.status === "error") {
    if (variant === "flip") {
      return <SaldoFlipView valor="—" contexto="saldo indisponível" onOpenDetail={onOpenDetail} hideCta={hideCta} />;
    }
    if (variant === "compact") return null;
    return (
      <Card className="mb-4">
        <div className="text-sm text-text-muted">Saldo de projetos ainda não publicado nesta base.</div>
        {state.status === "error" && (
          <div className="mt-1 text-xs text-text-faint">{state.message}</div>
        )}
      </Card>
    );
  }

  if (!model) return null;
  const { section, totals, top } = model;
  const { exerciseYear, dataReferencia } = section;
  if (anoSelecionado !== undefined && anoSelecionado !== exerciseYear) return null;

  if (variant === "flip") {
    if (!section.reconciliation.ok) {
      return <SaldoFlipView valor="—" contexto="saldo indisponível" onOpenDetail={onOpenDetail} hideCta={hideCta} />;
    }
    const n = totals.projetosComSaldo;
    return (
      <SaldoFlipView
        valor={fmtMilhoes(totals.saldoPotencial)}
        contexto={`${n} ${n === 1 ? "projeto" : "projetos"} · 6+ meses sem compromisso`}
        onOpenDetail={onOpenDetail}
        hideCta={hideCta}
      />
    );
  }

  const header = (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{LABELS.saldoParadoCard}</div>
      <div className="text-[11px] text-text-faint">
        Exercício {exerciseYear} · ref. {formatDiaMes(dataReferencia)}
      </div>
    </div>
  );

  if (!section.reconciliation.ok) {
    return (
      <Card className={`${cardClass} border-risk-critico`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 text-risk-critico" size={16} aria-hidden="true" />
            <div>
              {header}
              <div className="mt-2 text-sm font-semibold text-risk-critico">
                Saldo de projetos não reconciliado com a carteira — números ocultos.
              </div>
            </div>
          </div>
          <Button type="button" onClick={onOpenDetail} className="whitespace-nowrap">
            Ver auditoria
            <ArrowRight size={14} className="ml-1.5" aria-hidden="true" />
          </Button>
        </div>
      </Card>
    );
  }

  if (totals.saldoPotencial === 0) {
    return (
      <Card className={cardClass}>
        {header}
        <div className="mt-2 text-sm text-text-muted">Nenhum projeto com saldo parado no recorte.</div>
      </Card>
    );
  }

  const pctOrcamento = totals.orcamento !== 0 ? fmtPct(totals.saldoPotencial / totals.orcamento) : null;
  const nProjetos = totals.projetosComSaldo;
  const subtexto = `${pctOrcamento ? `${pctOrcamento} do orçamento · ` : ""}${nProjetos} ${nProjetos === 1 ? "projeto" : "projetos"} sem compromisso aprovado há 6+ meses`;

  if (variant === "compact") {
    const acima = totals.saldoDisponivel < 0;
    return (
      <Card className={cardClass}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{LABELS.saldoParadoCard}</div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
              <span className="text-xl font-extrabold leading-none text-text">{fmtBRL(totals.saldoPotencial, true)}</span>
              <span className="text-xs text-text-faint">{subtexto}</span>
            </div>
          </div>
          <TooltipPrimitive.Provider delayDuration={150}>
            <TooltipPrimitive.Root>
              <TooltipPrimitive.Trigger asChild>
                <div
                  tabIndex={0}
                  className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 rounded-sm"
                >
                  <span>Caixa {fmtBRL(totals.caixa, true)}</span>
                  <span aria-hidden="true">·</span>
                  <span>Comp. válido {fmtBRL(totals.compromissoValido, true)}</span>
                  <span aria-hidden="true">·</span>
                  <span className={acima ? "font-semibold text-risk-critico" : undefined}>
                    Saldo disponível (BG Gov)
                    <Info size={12} aria-hidden="true" className="ml-1 inline-block align-[-2px] text-text-faint" />
                    {" "}{fmtSaldo(totals.saldoDisponivel)}{acima ? " (acima do orçamento)" : ""}
                  </span>
                </div>
              </TooltipPrimitive.Trigger>
              <TooltipPrimitive.Portal>
                <TooltipPrimitive.Content
                  sideOffset={6}
                  className="max-w-xs rounded-md border border-border bg-card-alt px-3 py-2 text-xs text-text shadow-card z-50"
                >
                  {CRITERIO_BI_SALDO}
                  <TooltipPrimitive.Arrow className="fill-card-alt" />
                </TooltipPrimitive.Content>
              </TooltipPrimitive.Portal>
            </TooltipPrimitive.Root>
          </TooltipPrimitive.Provider>
          {!hideCta && (
            <Button type="button" variant="ghost" onClick={onOpenDetail} className="whitespace-nowrap">
              Ver risco de caixa →
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      {header}
      <div className="mt-2 text-2xl font-extrabold leading-none text-text">{fmtBRL(totals.saldoPotencial, true)}</div>
      <div className="mt-1 text-xs text-text-faint">{subtexto}</div>

      <SaldoBar
        caixa={totals.caixa}
        compromisso={totals.compromissoValido}
        saldo={totals.saldoDisponivel}
        orcamento={totals.orcamento}
        saldoPotencial={totals.saldoPotencial}
      />

      {variant === "full" && (
        <>
          {totals.compromissoLegado >= SALDO_LEGADO_MATERIAL && (
            <div className="mt-3 text-xs text-text-muted">
              Premissa: {fmtBRL(totals.compromissoLegado, true)} em compromissos de RCs anteriores a {exerciseYear} desconsiderados.
            </div>
          )}

          {top.length > 0 && (
            <ul className="mt-3 divide-y divide-border">
              {top.map((v: SaldoRecorteView) => {
                const meses = mesesDesde(v.ultimaDataCompromisso, dataReferencia);
                return (
                  <li key={v.key} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-text">{v.label}</div>
                      {v.aprovador && <div className="truncate text-[11px] text-text-faint">{v.aprovador}</div>}
                    </div>
                    <div className="flex flex-wrap items-baseline gap-x-3 text-xs">
                      <span className="font-bold text-text">{fmtBRL(v.saldoPotencial, true)}</span>
                      <span className="text-text-muted">{textoUltimoCompromisso(meses, exerciseYear)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {!hideCta && (
            <div className="mt-3 flex justify-end">
              <Button type="button" variant="ghost" onClick={onOpenDetail}>
                Ver risco de caixa →
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
