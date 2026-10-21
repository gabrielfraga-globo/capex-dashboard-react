import { useMemo, useState } from "react";
import type { KPIEstrategicoCarteira, ProjetoMetricas } from "../types";
import { fmtBRL, fmtPct } from "../lib/format";
import { useRecorteStore } from "../store/recorteStore";
import { navigate } from "../lib/simpleRouter";
import { useCarteiraResumo } from "../features/executivo/useCarteiraResumo";
import { KpiRow2026 } from "../features/executivo/KpiRow2026";
import { FluxoCaixaCard } from "../features/executivo/FluxoCaixaCard";
import { ExecucaoTorres } from "../features/executivo/ExecucaoTorres";
import { buildTorre2026, buildTorre2027, conciliacaoEmitido } from "../features/executivo/torres";
import { AttentionList } from "../features/executivo/AttentionList";
import { buildAttentionList } from "../features/executivo/attention";
import { acimaDe, emRiscoDe, paradosDe } from "../features/executivo/adapters";
import { FiltrosRecorte } from "../features/executivo/FiltrosRecorte";
import { useSaldoProjetos } from "../features/saldo/useSaldoProjetos";
import { aggregateSaldoBy, filterSaldoLinhas, ultimaDataParadaPorProjeto } from "../features/saldo/saldo";
import { RecorteAtivo } from "../components/RecorteAtivo";
import { AnaliseRiscoPanel } from "../components/AnaliseRiscoPanel";
import { RiskPanel } from "../features/radar/panels/RiskPanel";

interface Props {
  lista: ProjetoMetricas[];
  kpisEstrategicos: KPIEstrategicoCarteira[];
  onSelect: (p: ProjetoMetricas) => void;
  isLoadingCompromisso?: boolean;
  dataBase?: string | null;
}

const EXERCICIO = 2026;
const SALDO_HABILITADO = import.meta.env.VITE_FEATURE_SALDO_PROJETOS === "true";

export function VisaoDiretoriaPage({
  lista,
  kpisEstrategicos,
  onSelect,
  isLoadingCompromisso,
  dataBase,
}: Props) {
  const [riscoAberto, setRiscoAberto] = useState(false);
  const [kpisAbertos, setKpisAbertos] = useState(false);
  const [mostrar2027, setMostrar2027] = useState(false);
  const rubricas = useRecorteStore((s) => s.rubricas);

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
            { ...fontesAtencao, exerciseYear: EXERCICIO },
            { limit: 3, quotas: { ACIMA_ORCAMENTO: 1, RCS_EM_RISCO: 1, SALDO_PARADO: 1 } },
          )
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
      <div className="h-full rounded-card border border-border bg-card-alt animate-pulse" aria-label="Carregando…" />
    );
  }

  const { bgVivoSum, flow, listaAno, listaAno26, emRiscoCartao } = data;
  const caixa = bgVivoSum.realizado + bgVivoSum.emPagamento;
  const caixaPct = bgVivoSum.bgGov > 0 ? caixa / bgVivoSum.bgGov : null;

  return (
    <div className="flex flex-col gap-3 max-h-[calc(100vh-10.75rem)] overflow-y-auto">

      <div className="flex items-center justify-end shrink-0 mb-1">
        <FiltrosRecorte lista={lista} rubricasOptions={rubricasOptions} />
      </div>

      <RecorteAtivo />

      {/* ── Faixa de 3 números ─────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 shrink-0 rounded-card border border-border bg-card px-3 py-2">
        <p className="text-sm text-text min-w-0 truncate">
          <span>BG 26 <strong className="font-semibold">{fmtBRL(bgVivoSum.bgGov, true)}</strong></span>
          <span className="text-text-muted"> · </span>
          <span>Caixa <strong className="font-semibold">{fmtBRL(caixa, true)}</strong> ({fmtPct(caixaPct)})</span>
          <span className="text-text-muted"> · </span>
          <span>Em risco <strong className="font-semibold text-warn">{fmtBRL(emRiscoCartao, true)}</strong></span>
        </p>
        <button
          type="button"
          aria-expanded={kpisAbertos}
          aria-controls="visao-diretoria-kpis"
          onClick={() => setKpisAbertos((v) => !v)}
          className="shrink-0 text-xs font-semibold text-accent hover:underline"
        >
          ver todos <span className={`inline-block transition-transform ${kpisAbertos ? "rotate-180" : ""}`}>▾</span>
        </button>
      </div>

      {kpisAbertos && (
        <div id="visao-diretoria-kpis" className="flex gap-2 shrink-0 max-lg:flex-wrap items-stretch">
          <KpiRow2026 data={data} rubricas={rubricas} onAbrirRisco={() => setRiscoAberto(true)} />
        </div>
      )}

      {/* ── Execução por torre ─────────────────────────────── */}
      <ExecucaoTorres
        torre2026={torres.torre2026}
        torre2027={torres.torre2027}
        mostrar2027={mostrar2027}
        onToggle2027={() => setMostrar2027((v) => !v)}
        conciliacao={torres.conciliacao}
      />

      {/* ── Layout ─────────────────────────────────────────── */}
      <div className="grid grid-cols-[1fr_minmax(300px,360px)] gap-3 items-stretch min-h-0 flex-1">
        <div className="flex flex-col gap-3 min-w-0 min-h-0">
          <FluxoCaixaCard
            ano={2026}
            lista={listaAno}
            flow={flow}
            dataBase={dataBase}
            isLoadingCompromisso={isLoadingCompromisso}
          />
        </div>

        <div className="flex flex-col gap-3 min-w-0 min-h-0">
          <AttentionList itens={itensAtencao} onNavigate={navigate} />
          <AnaliseRiscoPanel
            somenteStatus
            lista={listaAno26}
            kpisEstrategicos={kpisEstrategicos}
            isLoadingCompromisso={isLoadingCompromisso}
            onSelectProject={onSelect}
          />
        </div>
      </div>

      <RiskPanel open={riscoAberto} onClose={() => setRiscoAberto(false)} risk={data.risk} />
    </div>
  );
}
