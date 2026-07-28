import { useMemo } from "react";
import type { Periodo, ProjetoMetricas } from "../types";
import { KpiCard, StatusCard } from "./ui/primitives";
import { fmtBRL, fmtPct } from "../lib/format";

export function ExecutiveSummary({ lista, periodo }: { lista: ProjetoMetricas[]; periodo: Periodo }) {
  const s = useMemo(() => {
    const orcamentoPeriodo = sum(lista, (p) => p.orcamentoPeriodo);
    const orcamentoPlurianual = sum(lista, (p) => p.orcamentoPlurianual);
    const executado = sum(lista, (p) => p.executado);
    const compromisso = sum(lista, (p) => p.compromisso);
    const aEmitir = sum(lista, (p) => p.aEmitir);
    const valorComprometidoTotal = executado + compromisso;
    const pctExecucao = orcamentoPeriodo > 0 ? executado / orcamentoPeriodo : null;
    const pctComprometimento = orcamentoPeriodo > 0 ? compromisso / orcamentoPeriodo : null;
    const desvioPlurianual = orcamentoPlurianual > 0 ? valorComprometidoTotal - orcamentoPlurianual : null;

    const nEstouro = lista.filter((p) => p.status === "Estouro").length;
    const nBaixoComprom = lista.filter((p) => p.status === "Baixo comprometimento").length;
    const nBaixaExec = lista.filter((p) => p.status === "Baixa execução").length;
    const nOK = lista.filter((p) => p.status === "OK").length;
    const nSemDados = lista.filter((p) => p.status === "Dados insuficientes").length;

    return {
      orcamentoPeriodo, orcamentoPlurianual, executado, compromisso, aEmitir,
      pctExecucao, pctComprometimento, desvioPlurianual,
      nEstouro, nBaixoComprom, nBaixaExec, nOK, nSemDados,
    };
  }, [lista]);

  const periodoLabel = { "2026": "2026", "2027": "2027", "Todos": "2026–2027" }[periodo];
  const nRisco = s.nEstouro + s.nBaixoComprom + s.nBaixaExec;

  const frase = useMemo(() => {
    if (s.nEstouro > 0) {
      return `A carteira ${periodoLabel} tem ${s.nEstouro} projeto(s) em estouro plurianual — prioridade máxima de revisão orçamentária.`;
    }
    if (s.pctExecucao !== null && s.pctExecucao < 0.4) {
      return `Execução de apenas ${fmtPct(s.pctExecucao)} do orçamento ${periodoLabel} — risco relevante para o caixa do período.`;
    }
    if (nRisco > 0) {
      return `${nRisco} projeto(s) exigem atenção na carteira ${periodoLabel}, concentrados em baixo comprometimento e baixa execução.`;
    }
    return `Carteira ${periodoLabel} sem riscos críticos identificados nos filtros atuais.`;
  }, [s, nRisco, periodoLabel]);

  return (
    <div className="mb-6">
      <p className="text-sm font-semibold text-text mb-3 border-l-2 border-accent pl-3">{frase}</p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
        <KpiCard label={`Orçamento ${periodoLabel}`} value={fmtBRL(s.orcamentoPeriodo)} sub={`${lista.length} projetos`} />
        <KpiCard label="Orçamento Plurianual" value={fmtBRL(s.orcamentoPlurianual)} sub="2026 + 2027" tooltip="Orçamento total aprovado do projeto, somando 2026 e 2027." />
        <KpiCard label="Executado" value={fmtBRL(s.executado)} sub={fmtPct(s.pctExecucao)} tooltip="Realizado + Em Pagamento do período selecionado." />
        <KpiCard label="Compromisso" value={fmtBRL(s.compromisso)} sub={fmtPct(s.pctComprometimento)} tooltip="Valor total contratado/PO emitida — não fracionado por ano." />
        <KpiCard label="A Emitir" value={fmtBRL(s.aEmitir)} sub="Orçamento do período − Compromisso" tooltip="Saldo do orçamento do período sem contrato firmado." />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <StatusCard status="Estouro" n={s.nEstouro} label="🔴 Estouro" sub="Executado+Compromisso > plurianual" />
        <StatusCard status="Baixo comprometimento" n={s.nBaixoComprom} label="🟠 Baixo Comprometimento" sub="< 80% do orçamento comprometido" />
        <StatusCard status="Baixa execução" n={s.nBaixaExec} label="🟡 Baixa Execução" sub="< 40% executado no período" />
        <StatusCard status="OK" n={s.nOK} label="🟢 OK" sub="Sem risco identificado" />
      </div>

      {s.desvioPlurianual !== null && s.desvioPlurianual > 0 && (
        <div className="text-xs text-red-300 bg-risk-critico/10 border border-risk-critico/40 rounded-md px-3 py-2">
          Desvio plurianual agregado: <b>{fmtBRL(s.desvioPlurianual)}</b> acima do orçamento aprovado.
        </div>
      )}
      {s.nSemDados > 0 && (
        <div className="text-xs text-text-muted mt-2">
          ⚪ {s.nSemDados} projeto(s) com dados insuficientes para classificação neste período.
        </div>
      )}
    </div>
  );
}

function sum(lista: ProjetoMetricas[], fn: (p: ProjetoMetricas) => number | null): number {
  return lista.reduce((a, p) => a + (fn(p) ?? 0), 0);
}
