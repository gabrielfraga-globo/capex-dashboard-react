import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { KPIEstrategicoCarteira, ProjetoMetricas } from "../types";
import { useRecorteStore } from "../store/recorteStore";
import { navigate } from "../lib/simpleRouter";
import { useCarteiraResumo } from "../features/executivo/useCarteiraResumo";
import { FluxoCaixaCard } from "../features/executivo/FluxoCaixaCard";
import { ExecucaoTorres } from "../features/executivo/ExecucaoTorres";
import { AderenciaPlano } from "../features/executivo/AderenciaPlano";
import { buildTorre2026, buildTorre2027, conciliacaoEmitido } from "../features/executivo/torres";
import { AttentionList } from "../features/executivo/AttentionList";
import { buildAttentionList } from "../features/executivo/attention";
import { acimaDe, emRiscoDe, paradosDe } from "../features/executivo/adapters";
import { FiltrosRecorte } from "../features/executivo/FiltrosRecorte";
import { useSaldoProjetos } from "../features/saldo/useSaldoProjetos";
import { aggregateSaldoBy, filterSaldoLinhas, ultimaDataParadaPorProjeto } from "../features/saldo/saldo";
import { RecorteAtivo } from "../components/RecorteAtivo";

interface Props {
  lista: ProjetoMetricas[];
  kpisEstrategicos: KPIEstrategicoCarteira[];
  onSelect: (p: ProjetoMetricas) => void;
  isLoadingCompromisso?: boolean;
  dataBase?: string | null;
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
}: Props) {
  const [mostrar2027, setMostrar2027] = useState(false);
  const rubricas = useRecorteStore((s) => s.rubricas);
  const containerRef = useRef<HTMLDivElement>(null);
  const altura = useAlturaRestante(containerRef);

  const saldo = useSaldoProjetos();
  const { data, rubricasOptions } = useCarteiraResumo(EXERCICIO, { lista, dataBase });

  const saldoPronto = useMemo(() => {
    if (!SALDO_HABILITADO || saldo.status !== "ready" || saldo.section.exerciseYear !== EXERCICIO) return null;
    return saldo.section;
  }, [saldo]);

  const fontesAtencao = useMemo(() => {
    if (!data) return null;
    const emRisco = emRiscoDe(data.risk.projects, data.listaAno26);
    if (!saldoPronto) return { acima: [], emRisco, parados: [] };
    const linhas = filterSaldoLinhas(saldoPronto.linhas, { projectKeys: data.saldoProjectKeys, rubricas });
    const views = aggregateSaldoBy(linhas, "projeto");
    return {
      acima: acimaDe(views),
      emRisco,
      parados: paradosDe(views, ultimaDataParadaPorProjeto(linhas), saldoPronto.dataReferencia),
    };
  }, [data, saldoPronto, rubricas]);

  const itensAtencao = useMemo(
    () =>
      fontesAtencao
        ? buildAttentionList(
            { acima: fontesAtencao.acima, emRisco: fontesAtencao.emRisco, parados: [], exerciseYear: EXERCICIO },
            { limit: 5, quotas: { ACIMA_ORCAMENTO: 0, RCS_EM_RISCO: 0 } },
          ).sort((a, b) => b.value - a.value)
        : [],
    [fontesAtencao],
  );

  const torres = useMemo(() => {
    if (!data) return null;
    const { bgVivoSum, compromisso27, bgGov27, emRiscoCartao, emitidoCarteira } = data;
    return {
      torre2026: buildTorre2026({
        bg: bgVivoSum.bgGov,
        realizado: bgVivoSum.realizado,
        emPagamento: bgVivoSum.emPagamento,
        comp26: bgVivoSum.emitido,
        emRisco: emRiscoCartao,
      }),
      torre2027: mostrar2027 ? buildTorre2027({ bg: bgGov27, comp27: compromisso27 }) : null,
      conciliacao: conciliacaoEmitido({ emitidoCarteira, comp26: bgVivoSum.emitido, comp27: compromisso27 }),
    };
  }, [data, mostrar2027]);

  if (!data || !torres) {
    return (
      <div ref={containerRef} style={altura !== null ? { height: altura } : undefined} className="overflow-hidden">
        <div className="h-full rounded-card border border-border bg-card-alt animate-pulse" aria-label="Carregando…" />
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

      <div className="flex items-center justify-end shrink-0">
        <FiltrosRecorte lista={lista} rubricasOptions={rubricasOptions} />
      </div>

      <RecorteAtivo />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,2fr)_minmax(0,1fr)] grid-rows-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-3">
        {/* ── Execução do plano ───────────────────────────── */}
        <div className={CELULA_CARD}>
          <ExecucaoTorres
            torre2026={torres.torre2026}
            torre2027={torres.torre2027}
            mostrar2027={mostrar2027}
            onToggle2027={() => setMostrar2027((v) => !v)}
            conciliacao={torres.conciliacao}
            comp27={data.compromisso27}
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
            bgVivoTimes={bgVivoSum.bgVivo}
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
          />
        </div>

        {/* ── Top 5 ofensores ─────────────────────────────── */}
        <div className={CELULA_CARD}>
          <AttentionList variante="sinais" itens={itensAtencao} onNavigate={navigate} />
        </div>
      </div>
    </div>
  );
}
