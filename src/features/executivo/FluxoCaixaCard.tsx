import type { ProjetoMetricas } from "../../types";
import { fmtBRL, fmtPct } from "../../lib/format";
import { navigate } from "../../lib/simpleRouter";
import { FluxoCaixaChart } from "../../components/FluxoCaixaChart";
import { DistribuicaoFinanceiraPlataforma } from "../../components/Diagnostics";
import { FlipCard } from "../../components/ui/FlipCard";
import type { CarteiraResumoData } from "./useCarteiraResumo";

interface FluxoCaixaCardProps {
  ano: 2026 | 2027;
  lista: ProjetoMetricas[];
  flow: CarteiraResumoData["flow"];
  dataBase?: string | null;
  isLoadingCompromisso?: boolean;
  /** Verso mostra só o gráfico 100% de composição (usado na Visão Diretoria). */
  versoSomenteComposicao?: boolean;
  /** Sem altura mínima fixa: o card ocupa a altura da célula que o contém (Visão Diretoria). */
  preencherAltura?: boolean;
}

/** Card do Fluxo de caixa da Visão Executiva (frente) com a Composição por plataforma no verso (só 2026). */
export function FluxoCaixaCard({ ano, lista, flow, dataBase, isLoadingCompromisso, versoSomenteComposicao = false, preencherAltura = false }: FluxoCaixaCardProps) {
  const minFrente = preencherAltura ? "min-h-0" : "min-h-[220px]";
  const minGrafico = preencherAltura ? "min-h-0" : "min-h-[237px]";
  const fluxoCard = (
    <div className={`flex flex-col rounded-card border border-border bg-card px-5 pt-4 pb-3 h-full ${minFrente}`}>
      <div className="flex items-center justify-between shrink-0 mb-1 pr-8">
        <div className="flex items-center gap-3">
          <p data-flip-title className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">Fluxo de caixa</p>
          <span className="flex items-center gap-1 text-[10px] text-text-muted font-medium">
            <span className="w-4 h-0 border-b border-dashed border-text-muted inline-block" /> Planejado
          </span>
          <span className="flex items-center gap-1 text-[10px] text-info font-medium">
            <span className="inline-block w-4 h-1.5 bg-info rounded-sm" /> Realizado
          </span>
        </div>
        <button type="button" className="text-[12px] text-info hover:underline" onClick={() => navigate("/auditoria")}>Ver fluxo completo →</button>
      </div>
      {ano === 2027 ? (
        <div className="flex-1 flex items-center justify-center text-[12px] text-text-muted bg-card-alt rounded border border-border/50 border-dashed m-4 p-6 text-center">
          Fluxo mensal de 2027 ainda não disponível na base (orçamento só jan–mar)
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 gap-4 items-stretch">
          <div className={`flex-1 min-w-0 flex flex-col ${minGrafico}`}>
            <FluxoCaixaChart
              lista={lista}
              dataBase={dataBase ?? null}
              isLoadingCompromisso={isLoadingCompromisso}
              compact
              bare
            />
          </div>
          <div className="flex flex-col justify-center gap-2 min-w-0 shrink-0 w-[150px]">
            <div>
              <div className="text-[10px] text-text-muted mb-0.5">Realizado acumulado</div>
              <div className="text-[15px] font-bold tabular-nums text-text">{fmtBRL(flow.realizadoAcumulado, true)}</div>
            </div>
            <div>
              <div className="text-[10px] text-text-muted mb-0.5">Planejado acumulado</div>
              <div className="text-[15px] font-bold tabular-nums text-text">{fmtBRL(flow.planejadoAcumulado, true)}</div>
            </div>
            <div>
              <div className="text-[10px] text-text-muted mb-0.5">Desvio</div>
              <div className={`text-[15px] font-bold tabular-nums whitespace-nowrap ${flow.desvio < 0 ? "text-crit" : "text-ok"}`}>
                {flow.desvio >= 0 ? "+" : ""}{fmtBRL(flow.desvio, true)}
                <span className="block text-[11px] font-normal text-text-muted">
                  ({flow.desvioRel >= 0 ? "+" : ""}{fmtPct(flow.desvioRel)})
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (ano !== 2026) return fluxoCard;

  return (
    <FlipCard
      compact
      className="flex-1 min-h-0 flex flex-col [&>.flip-stage]:flex-1 [&>.flip-stage]:min-h-0"
      frontLabel="Fluxo de caixa"
      backLabel="Composição por plataforma"
      front={fluxoCard}
      back={
        <div className={`flex flex-col rounded-card border border-border bg-card px-5 pt-4 pb-3 h-full overflow-auto ${minFrente}`}>
          <DistribuicaoFinanceiraPlataforma lista={lista} somenteComposicao={versoSomenteComposicao} />
        </div>
      }
    />
  );
}
