import { useMemo } from "react";
import type { Periodo, ProjetoMetricas } from "../types";
import { KpiCard, InfoTooltip, RiskBadge } from "./ui/primitives";
import { fmtBRL, fmtPct } from "../lib/format";
import { generateExecutiveSummary, generateRiskSummary, generateTopOffenders, generateExecutiveInsights } from "../lib/insights";

const COBERTURA_STYLE = (pct: number | null) => {
  if (pct === null) return "from-slate-600 to-slate-800 text-white";
  if (pct >= 0.9) return "from-risk-baixo to-emerald-700 text-emerald-950";
  if (pct >= 0.7) return "from-risk-medio to-amber-700 text-amber-950";
  return "from-risk-alto to-orange-800 text-white";
};

export function ExecutiveSummary({
  lista,
  periodo,
  onSelect,
}: {
  lista: ProjetoMetricas[];
  periodo: Periodo;
  onSelect: (p: ProjetoMetricas) => void;
}) {
  const resumo = useMemo(() => generateExecutiveSummary(lista), [lista]);
  const risco = useMemo(() => generateRiskSummary(lista), [lista]);
  const ofensores = useMemo(() => generateTopOffenders(lista, 5), [lista]);
  const insights = useMemo(() => generateExecutiveInsights(lista), [lista]);

  const periodoLabel = { "2026": "2026", "2027": "2027", "Todos": "2026–2027" }[periodo];

  return (
    <div className="mb-5">
      <p className="text-base font-bold text-text mb-4">{resumo.headline}</p>

      {/* Carteira / Emitido / Executado / A Emitir */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <KpiCard
          label={`Carteira ${periodoLabel}`}
          value={fmtBRL(resumo.orcamentoPeriodo)}
          sub={`${lista.length} projetos`}
          tooltip="Orçamento total aprovado para o período selecionado."
        />
        <KpiCard
          label="Emitido"
          value={fmtBRL(resumo.compromisso)}
          tooltip="Valor já formalizado em contrato ou pedido de compra, mesmo que ainda não tenha sido pago."
        />
        <KpiCard
          label="Executado"
          value={fmtBRL(resumo.executado)}
          tooltip="Valor que já foi efetivamente pago ou reconhecido como gasto no período (Realizado + Em Pagamento)."
        />
        <KpiCard
          label="A Emitir"
          value={fmtBRL(resumo.aEmitir)}
          sub={`${fmtBRL(resumo.orcamentoPeriodo, true)} − ${fmtBRL(resumo.executado, true)} − ${fmtBRL(resumo.compromisso, true)}`}
          tooltip="Parcela do orçamento que ainda não entrou no fluxo financeiro (nem foi gasta, nem tem contrato emitido). Cálculo: Orçamento − Executado − Emitido."
        />
      </div>

      {/* Cobertura Financeira / Exposição Financeira / Projetos Críticos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className={`rounded-card p-3.5 shadow-card bg-gradient-to-br ${COBERTURA_STYLE(risco.coberturaFinanceira)}`}>
          <div className="text-2xl font-extrabold">{fmtPct(risco.coberturaFinanceira, 0)}</div>
          <div className="text-[12px] font-bold flex items-center gap-1">
            📈 Cobertura Financeira
            <span className="[&_.info-icon]:text-white/80 [&_.info-icon:hover]:text-white">
              <InfoTooltip text="Parcela do orçamento que já tem movimentação financeira (executado + emitido). Fórmula: (Executado + Emitido) ÷ Orçamento. Quanto maior, menor o risco de não realização." />
            </span>
          </div>
        </div>
        <div className="rounded-card p-3.5 shadow-card bg-gradient-to-br from-slate-600 to-slate-800 text-white">
          <div className="text-xl font-extrabold">{fmtBRL(risco.exposicaoFinanceira, true)}</div>
          <div className="text-[12px] font-bold flex items-center gap-1">
            ⚠️ Exposição Financeira
            <span className="[&_.info-icon]:text-white/80 [&_.info-icon:hover]:text-white">
              <InfoTooltip text="Valor total em risco de não realização: o excedente dos projetos em estouro somado ao saldo ainda sem cobertura dos demais projetos em risco." />
            </span>
          </div>
        </div>
        <div className="rounded-card p-3.5 shadow-card bg-gradient-to-br from-risk-critico to-red-900 text-white">
          <div className="text-2xl font-extrabold">{risco.nCriticos}</div>
          <div className="text-[12px] font-bold flex items-center gap-1">
            🎯 Projetos Críticos
            <span className="[&_.info-icon]:text-white/80 [&_.info-icon:hover]:text-white">
              <InfoTooltip text="Projetos em Estouro ou com Risco de Não Realização (mais de 30% do orçamento sem cobertura financeira) — exigem ação prioritária." />
            </span>
          </div>
        </div>
      </div>

      {/* Destaques: Top 5 ofensores + insights */}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-card border border-border bg-card p-3.5">
          <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold mb-2">Top 5 Ofensores</p>
          <div className="space-y-1">
            {ofensores.length === 0 ? (
              <p className="text-xs text-text-faint">Nenhum ofensor relevante nos filtros atuais.</p>
            ) : (
              ofensores.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => onSelect(p)}
                  className="w-full flex items-center justify-between gap-2 text-left text-xs rounded px-1.5 py-1 hover:bg-card-alt transition-colors"
                >
                  <span className="text-text truncate">{i + 1}. {p.nome}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-text-muted">{fmtBRL(p.status === "Estouro" ? (p.desvioPlurianual ?? 0) : (p.aEmitir ?? 0), true)}</span>
                    <RiskBadge status={p.status} />
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-card border border-border bg-card p-3.5">
          <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold mb-2">Insights Executivos</p>
          <div className="space-y-1.5">
            {insights.length === 0 ? (
              <p className="text-xs text-text-faint">Sem insights relevantes nos filtros atuais.</p>
            ) : (
              insights.map((ins, i) => <p key={i} className="text-xs text-text leading-snug">{ins}</p>)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
