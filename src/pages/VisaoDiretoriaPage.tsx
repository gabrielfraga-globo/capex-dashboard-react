import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { KPIEstrategicoCarteira, ProjetoMetricas } from "../types";
import { useRecorteStore } from "../store/recorteStore";
import { navigate } from "../lib/simpleRouter";
import { useCarteiraResumo } from "../features/executivo/useCarteiraResumo";
import { useMetricas } from "../domain/useMetricas";
import { FluxoCaixaCard } from "../features/executivo/FluxoCaixaCard";
import { ExecucaoTorres } from "../features/executivo/ExecucaoTorres";
import { RiskPanel } from "../features/radar/panels/RiskPanel";
import { AderenciaPlano } from "../features/executivo/AderenciaPlano";
import { AttentionList, type SaldosParadosResumo } from "../features/executivo/AttentionList";
import { ATTENTION_ROUTES } from "../features/executivo/config";
import type { AttentionItem, AttentionSource } from "../features/executivo/types";
import { paradosDe } from "../features/executivo/adapters";
import { FiltrosRecorte } from "../features/executivo/FiltrosRecorte";
import { useSaldoProjetos } from "../features/saldo/useSaldoProjetos";
import { aggregateSaldoBy, filterSaldoLinhas, ultimaDataParadaPorProjeto } from "../features/saldo/saldo";
import { RecorteAtivo } from "../components/RecorteAtivo";
import { ContextBar } from "../components/ContextBar";
import type { RelatorioParsing } from "../types";
import { fmtBRL } from "../lib/format";

interface Props {
  lista: ProjetoMetricas[];
  kpisEstrategicos: KPIEstrategicoCarteira[];
  onSelect: (p: ProjetoMetricas) => void;
  isLoadingCompromisso?: boolean;
  dataBase?: string | null;
  parsed: RelatorioParsing;
  periodoLabel: string;
}

const EXERCICIO = 2026;
const SALDO_HABILITADO = import.meta.env.VITE_FEATURE_SALDO_PROJETOS === "true";
/** Folga entre o fim da página e o fim da janela. */
const MARGEM_INFERIOR_PX = 12;

/** Altura da página = janela − topo do container − margem; recalcula ao redimensionar a janela ou ao mudar o layout acima. */
function useAlturaRestante(ref: RefObject<HTMLDivElement | null>): number | null {
  const [altura, setAltura] = useState<number | null>(null);

  useLayoutEffect(() => {
    const medir = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setAltura(Math.max(0, window.innerHeight - top - MARGEM_INFERIOR_PX));
    };
    medir();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    observer?.observe(document.body);
    window.addEventListener("resize", medir);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, [ref]);

  return altura;
}

/** Card do grid: ocupa a célula inteira e nunca cresce além dela. */
const CELULA_CARD = "min-h-0 min-w-0 overflow-hidden [&>*]:h-full [&>*]:min-h-0 [&>*]:overflow-hidden";

export function VisaoDiretoriaPage({
  lista,
  onSelect,
  isLoadingCompromisso,
  dataBase,
  parsed,
  periodoLabel,
}: Props) {
  const [mostrar2027, setMostrar2027] = useState(false);
  const [riscoAberto, setRiscoAberto] = useState(false);
  const rubricas = useRecorteStore((s) => s.rubricas);
  const containerRef = useRef<HTMLDivElement>(null);
  const altura = useAlturaRestante(containerRef);

  const saldo = useSaldoProjetos();
  const { data, rubricasOptions } = useCarteiraResumo(EXERCICIO, { lista, dataBase });
  const metricas = useMetricas({ lista, dataBase });

  const saldoPronto = useMemo(() => {
    if (!SALDO_HABILITADO || saldo.status !== "ready" || saldo.section.exerciseYear !== EXERCICIO) return null;
    return saldo.section;
  }, [saldo]);

  const parados = useMemo<AttentionSource[] | null>(() => {
    if (!data || !saldoPronto) return null;
    const linhas = filterSaldoLinhas(saldoPronto.linhas, { projectKeys: data.saldoProjectKeys, rubricas });
    const views = aggregateSaldoBy(linhas, "projeto");
    return paradosDe(views, ultimaDataParadaPorProjeto(linhas), saldoPronto.dataReferencia);
  }, [data, saldoPronto, rubricas]);

  /** Vermelho: maior comprometido em risco por projeto. Âmbar: maior excesso sobre o orçamento por projeto. Top 5 pelo valor. */
  const itensAtencao = useMemo<AttentionItem[]>(() => {
    if (!metricas) return [];
    const vermelhos: AttentionItem[] = metricas.simples.projetos
      .filter((p) => p.emRiscoSinal > 0)
      .map((p) => ({
        kind: "RCS_EM_RISCO",
        projectKey: p.projeto,
        projectName: p.projeto,
        owner: null,
        value: p.emRiscoSinal,
        detail: `${fmtBRL(p.emRiscoSinal, true)} comprometido em risco`,
        href: ATTENTION_ROUTES.RCS_EM_RISCO,
      }));
    const ambares: AttentionItem[] = metricas.simples.projetos
      .filter((p) => p.excesso > 0)
      .map((p) => ({
        kind: "ACIMA_ORCAMENTO",
        projectKey: p.projeto,
        projectName: p.projeto,
        owner: null,
        value: p.excesso,
        detail: `${fmtBRL(p.excesso, true)} acima do orçamento`,
        href: ATTENTION_ROUTES.ACIMA_ORCAMENTO,
      }));
    return [...vermelhos, ...ambares].sort((a, b) => b.value - a.value).slice(0, 5);
  }, [metricas]);

  /** Σ, N e top 3 vêm da mesma lista de parados; sem saldo pronto a seção fica oculta. */
  const saldosParados = useMemo<SaldosParadosResumo | null>(() => {
    if (!parados || !saldoPronto) return null;
    const ordenados = [...parados].sort((a, b) => b.value - a.value);
    return {
      total: ordenados.reduce((soma, p) => soma + p.value, 0),
      projetos: ordenados.length,
      top: ordenados.slice(0, 3),
    };
  }, [parados, saldoPronto]);

  const bg27 = useMemo(
    () => (metricas ? metricas.projetos.reduce((soma, p) => soma + (p.orcamento2027 ?? 0), 0) : 0),
    [metricas],
  );

  const projetosAcima = useMemo(
    () => (metricas ? metricas.simples.projetos.filter((p) => p.excesso > 0).length : 0),
    [metricas],
  );

  if (!data || !metricas) {
    return (
      <div ref={containerRef} style={altura !== null ? { height: altura } : undefined} className="flex flex-col gap-3 overflow-hidden">
        <ContextBar parsed={parsed} periodoLabel={periodoLabel} className="shrink-0" />
        <div className="min-h-0 flex-1 rounded-card border border-border bg-card-alt animate-pulse" aria-label="Carregando…" />
      </div>
    );
  }

  const { bgVivoSum, flow, listaAno, listaAno26 } = data;

  return (
    <div
      ref={containerRef}
      style={altura !== null ? { height: altura } : undefined}
      className="flex flex-col gap-3 overflow-hidden"
    >
      <ContextBar
        parsed={parsed}
        periodoLabel={periodoLabel}
        className="shrink-0"
        acoes={<FiltrosRecorte lista={lista} rubricasOptions={rubricasOptions} />}
      />

      <RecorteAtivo />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,2fr)_minmax(0,1fr)] grid-rows-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-3">
        {/* ── Execução do plano ───────────────────────────── */}
        <div className={CELULA_CARD}>
          <ExecucaoTorres
            total={metricas.simples.total}
            bg27={bg27}
            projetosAcima={projetosAcima}
            mostrar2027={mostrar2027}
            onToggle2027={() => setMostrar2027((v) => !v)}
            onOpenRisco={() => setRiscoAberto(true)}
          />
        </div>

        {/* ── Aderência ao plano ──────────────────────────── */}
        <div className={CELULA_CARD}>
          <AderenciaPlano
            projetos={listaAno26}
            rows={data.opRows}
            dataRef={data.dbDate}
            exerciseYear={EXERCICIO}
            bgGov={bgVivoSum.bgGov}
            onSelectProject={onSelect}
          />
        </div>

        {/* ── Fluxo ───────────────────────────────────────── */}
        <div className={CELULA_CARD}>
          <FluxoCaixaCard
            ano={2026}
            lista={listaAno}
            flow={flow}
            dataBase={dataBase}
            isLoadingCompromisso={isLoadingCompromisso}
            versoSomenteComposicao
            preencherAltura
            desvioNeutro
          />
        </div>

        {/* ── Pontos de ação ──────────────────────────────── */}
        <div className={CELULA_CARD}>
          <AttentionList itens={itensAtencao} parados={saldosParados} onNavigate={navigate} />
        </div>
      </div>

      <RiskPanel open={riscoAberto} onClose={() => setRiscoAberto(false)} risk={data.risk} />
    </div>
  );
}
