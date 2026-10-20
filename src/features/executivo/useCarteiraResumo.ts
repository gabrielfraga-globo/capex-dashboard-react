import { useMemo } from "react";
import type { ProjetoMetricas } from "../../types";
import { formatarIsoLocal } from "../../lib/format";
import { aplicarFiltroRubrica } from "../../lib/rubrica";
import { projetoNoRecorteComRubrica, rcNoRecorte, rubricasDoRecorte, type Recorte } from "../../lib/recorte";
import { useRecorteStore } from "../../store/recorteStore";
import { usePortfolioData } from "../../hooks/usePortfolioData";
import { computeMetricas, withParticipacaoRisco } from "../../lib/metrics";
import { useCuration } from "../radar/useCuration";
import {
  buildProjectBalances,
  summarizeBalances,
  buildProjectsAtRisk,
  buildCurationConsistency,
  sumProvisioned,
  buildBridge,
  buildBottleneck,
  buildInsights,
  buildFlowSummary,
  buildBgVivo
} from "../radar/executive";
import { buildOperationalRows } from "../radar/operational";
import { explicarCompromissoExercicio, fraseVirada } from "./compromissoExplicacao";
import { RC_TO_PAYMENT_DAYS } from "../radar/stageConfig";

export function parseDateBR(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day)
  ) return null;
  return parsed;
}

export interface CarteiraResumoOpcoes {
  lista: ProjetoMetricas[];
  dataBase?: string | null;
}

/**
 * Cálculos da Visão Executiva (faixa KPI 2026/2027, fluxo, ritmo, riscos).
 * Os filtros vêm do `useRecorteStore` global; `lista` e `dataBase` vêm da página.
 */
export function useCarteiraResumo(ano: 2026 | 2027, { lista, dataBase }: CarteiraResumoOpcoes) {
  const { bundle, curationMap, rcViews } = useCuration();
  const { parsed } = usePortfolioData();
  const programa = useRecorteStore((s) => s.programa);
  const rubricas = useRecorteStore((s) => s.rubricas);
  const gestor = useRecorteStore((s) => s.gestor);
  const aprovador = useRecorteStore((s) => s.aprovador);
  const busca = useRecorteStore((s) => s.busca);

  // Programa e plataforma são o mesmo campo (n4Curta): a tela usa o campo único `programa` do recorte
  const recorte = useMemo<Recorte>(
    () => ({ programa, rubricas, gestor, aprovador, busca }),
    [programa, rubricas, gestor, aprovador, busca]
  );
  const projetoPorNome = useMemo(() => new Map((parsed?.projetos ?? []).map((p) => [p.nome, p])), [parsed]);

  const listaSaldo = useMemo(() => lista.filter((p) => projetoNoRecorteComRubrica(p, recorte)), [lista, recorte]);
  const saldoProjectKeys = useMemo(() => new Set(listaSaldo.map(p => p.id)), [listaSaldo]);

  const rubricasOptions = useMemo(
    () => rubricasDoRecorte(parsed?.projetos ?? [], rcViews, bundle?.payments?.inPayment ?? []),
    [parsed, rcViews, bundle]
  );

  const computed = useMemo(() => {
    if (!bundle) return null;
    const dbDate = parseDateBR(dataBase) || new Date();
    const referenceDateStr = formatarIsoLocal(dbDate);

    let listaFiltradaBase = lista.filter((p) => projetoNoRecorteComRubrica(p, recorte));
    
    if (rubricas.length > 0) {
      // os campos de métrica (acumulados, status, ritmo) vêm calculados de cima: recalcula sobre os valores da rubrica
      listaFiltradaBase = withParticipacaoRisco(aplicarFiltroRubrica(listaFiltradaBase, rubricas).map((p) => computeMetricas(p, p.periodo)));
    }
    
    // Lista adaptada para o ano selecionado, garantindo que métricas do período batam
    const listaAno = listaFiltradaBase.map(p => ({
      ...p,
      orcamentoPeriodo: ano === 2026 ? p.orcamento2026 : p.orcamento2027,
      realizadoAcumulado: ano === 2026 ? p.realizado2026 : p.realizado2027,
      executado: ano === 2026 ? (p.realizado2026 ?? 0) + (p.emPagamento2026 ?? 0) : (p.realizado2027 ?? 0) + (p.emPagamento2027 ?? 0)
    }));

    const listaAno26 = listaFiltradaBase.map(p => ({
      ...p,
      orcamentoPeriodo: p.orcamento2026,
      realizadoAcumulado: p.realizado2026,
      executado: (p.realizado2026 ?? 0) + (p.emPagamento2026 ?? 0)
    }));

    const rcsNoRecorte = new Set(
      rcViews.filter((rc) => rcNoRecorte(rc, recorte, projetoPorNome, bundle.exerciseYear)).map((rc) => rc.rc)
    );
    const allOpRows = buildOperationalRows(bundle, curationMap, referenceDateStr);
    
    const opRows = allOpRows.filter((row) => rcsNoRecorte.has(row.rc));

    const projectBalances = buildProjectBalances(listaAno, bundle.projectActivity, dbDate);
    const balanceSummary = summarizeBalances(projectBalances);
    const risk = buildProjectsAtRisk(opRows);
    const consistency = buildCurationConsistency(opRows, dbDate, bundle.exerciseYear);
    const { prov26, provRisco, prov27 } = sumProvisioned(opRows);

    let totalRealizado = 0, totalEmPagamento = 0, bgSistemico = 0;
    for (const p of listaAno) {
      totalRealizado += p.realizado2026 ?? 0;
      totalEmPagamento += p.emPagamento2026 ?? 0;
      bgSistemico += p.orcamento2026 ?? 0;
    }

    let residual = 0, naoOcorre = 0;
    for (const r of opRows) {
      if (r.stage === "RESIDUAL" || r.stage === "DESCONHECIDA") residual += r.value;
      else if (r.classification === "NAO_OCORRE") naoOcorre += r.value;
    }

    const bridge = buildBridge({
      bg: bgSistemico, realizado: totalRealizado, emPagamento: totalEmPagamento,
      prov26, provRisco, prov27, residual, naoOcorre, saldoLiquido: balanceSummary.liquido,
    });
    const bottleneck = buildBottleneck(opRows);
    const pendente = Math.max(0, consistency.scopeValue - opRows.filter((r) => r.isClassificationConfirmed).reduce((s, r) => s + r.value, 0));
    buildInsights({
      bgSistemico, projetado: totalRealizado + totalEmPagamento + prov26,
      realizado: totalRealizado, emPagamento: totalEmPagamento,
      projetosEmRiscoCount: risk.count, projetosEmRiscoValue: risk.totalValue, top10RiscoValue: risk.top10Value,
      dataBase: dbDate, opRows,
      saldoParadoValue: bundle.projectActivity ? balanceSummary.parado.value : 0,
      curadoriaPendenteValue: consistency.scopeCount > consistency.confirmed ? pendente : 0,
    });
    
    const bgVivoSum = buildBgVivo(listaAno, opRows, ano);
    const compromisso27 = buildBgVivo(listaAno, opRows, 2027).emitido;

    const flow = buildFlowSummary(listaAno);

    // Mesmo valor do cartão "BG Gov 27" (aba 2027): Σ orçamento 2027 da lista filtrada
    const bgGov27 = buildBgVivo(listaFiltradaBase, opRows, 2027).bgGov;
    // Mesmo valor do cartão "Em risco" (KpiRow2026)
    const emRiscoCartao = risk.totalValue;
    // Mesmo valor do "Emitido" da Execução do Plano (Σ compromisso da listaAno)
    const emitidoCarteira = listaAno.reduce((a, p) => a + (p.compromisso ?? 0), 0);

    return {
      bgSistemico, totalRealizado, totalEmPagamento, prov26, provRisco, prov27,
      balanceSummary, projectBalances, risk, bridge, bottleneck,
      flow, listaAno, listaAno26, bgVivoSum, compromisso27, opRows, dbDate,
      bgGov27, emRiscoCartao, emitidoCarteira,
      notaVirada: fraseVirada(dbDate, bundle.exerciseYear, RC_TO_PAYMENT_DAYS),
    };
  }, [bundle, curationMap, rcViews, lista, recorte, projetoPorNome, rubricas, dataBase, ano]);

  const explicacaoCompromisso = useMemo(
    () => (computed ? explicarCompromissoExercicio(computed.opRows, ano) : null),
    [computed, ano]
  );

  const data = computed && explicacaoCompromisso
    ? { ...computed, explicacaoCompromisso, saldoProjectKeys }
    : null;
  const status = data ? "ready" : "loading";

  return {
    status,
    data,
    rubricasOptions,
    bgGov27: data?.bgGov27 ?? 0,
    emRiscoCartao: data?.emRiscoCartao ?? 0,
    emitidoCarteira: data?.emitidoCarteira ?? 0,
  };
}

export type CarteiraResumoData = NonNullable<ReturnType<typeof useCarteiraResumo>["data"]>;
