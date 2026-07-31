import { useMemo } from "react";
import type { ProjetoMetricas } from "../types";
import { generateDeltaYTD } from "../lib/insights";
import { fmtBRL } from "../lib/format";
import { InfoTooltip, RiskBadge } from "./ui/primitives";
import { BentoCard } from "./ui/bento";

/**
 * Radar Executivo — responde só 4 perguntas:
 * 1. Estamos executando o plano? (headline + Delta YTD)
 * 2. Qual o delta YTD? (KPI principal)
 * 3. Quais projetos exigem ação? (Estouro + Risco de Não Realização)
 * 4. Quais projetos precisam revisão de fluxo de caixa?
 *
 * Nada de cobertura financeira, emitido, em pagamento, matriz de risco, fórmulas
 * ou tabela detalhada aqui — isso vive só na Auditoria da Carteira.
 */
export function RadarExecutivo({ lista, onSelect }: { lista: ProjetoMetricas[]; onSelect: (p: ProjetoMetricas) => void }) {
  const delta = useMemo(() => generateDeltaYTD(lista), [lista]);
  const exigemAcao = useMemo(
    () => [...lista.filter((p) => p.status === "Estouro" || p.status === "Risco de Não Realização")]
      .sort((a, b) => b.riscoScore - a.riscoScore),
    [lista]
  );
  const revisaoFluxo = useMemo(() => lista.filter((p) => p.status === "Revisão de Fluxo de Caixa"), [lista]);

  return (
    <div>
      <p className="text-base font-bold text-text mb-4">{delta.headline}</p>

      <div className="rounded-card border border-accent/30 bg-gradient-to-br from-card-alt to-card p-5 shadow-card mb-5 max-w-sm">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-text-muted font-semibold">
          Delta YTD
          <InfoTooltip text="Planejado Acumulado − Realizado Acumulado. Positivo significa atrás do plano; negativo, à frente do plano." />
        </div>
        <div className="text-4xl font-extrabold text-text mt-1">{fmtBRL(delta.deltaYTD)}</div>
        <div className="text-xs text-text-faint mt-2">Planejado {fmtBRL(delta.planejadoAcumulado, true)} · Realizado {fmtBRL(delta.realizadoAcumulado, true)}</div>
      </div>

      <div className="space-y-3">
        <BentoCard title="Projetos que Exigem Ação" icon="🎯" badge={<span className="text-xs text-text-muted">({exigemAcao.length})</span>}>
          {exigemAcao.length === 0 ? (
            <p className="text-xs text-text-faint">Nenhum projeto exige ação nos filtros atuais.</p>
          ) : (
            <div className="space-y-1">
              {exigemAcao.slice(0, 15).map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSelect(p)}
                  className="w-full flex items-center justify-between gap-2 text-left text-xs rounded px-1.5 py-1 hover:bg-card-alt transition-colors"
                >
                  <span className="text-text truncate">{p.nome}</span>
                  <RiskBadge status={p.status} />
                </button>
              ))}
            </div>
          )}
        </BentoCard>

        <BentoCard title="Revisão de Fluxo de Caixa" icon="🔵" badge={<span className="text-xs text-text-muted">({revisaoFluxo.length})</span>}>
          {revisaoFluxo.length === 0 ? (
            <p className="text-xs text-text-faint">Nenhum projeto nesta situação.</p>
          ) : (
            <div className="space-y-1">
              {revisaoFluxo.slice(0, 15).map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSelect(p)}
                  className="w-full flex items-center justify-between gap-2 text-left text-xs rounded px-1.5 py-1 hover:bg-card-alt transition-colors"
                >
                  <span className="text-text truncate">{p.nome}</span>
                  <RiskBadge status={p.status} />
                </button>
              ))}
            </div>
          )}
        </BentoCard>
      </div>
    </div>
  );
}
