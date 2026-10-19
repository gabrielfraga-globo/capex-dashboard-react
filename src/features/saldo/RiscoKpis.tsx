import { Card } from "../../components/ui/primitives";
import { fmtBRL } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { PressaoFolga } from "./saldo";

const plural = (n: number): string => `${n} ${n === 1 ? "projeto" : "projetos"}`;

export function RiscoKpis({ pf }: { pf: PressaoFolga }) {
  const temPressao = pf.pressao > 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Card>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Pressão</div>
        <div
          className={cn("mt-1 text-2xl font-bold", temPressao ? "text-risk-critico" : "text-text")}
          title={fmtBRL(pf.pressao)}
        >
          {fmtBRL(pf.pressao, true)}
        </div>
        {temPressao ? (
          <>
            <div className="text-xs text-text-muted">acima do orçamento</div>
            <div className="mt-1 text-[11px] text-text-faint">
              {plural(pf.projetosPressao)}
              {pf.maiorRubricaPressao ? ` · maior: ${pf.maiorRubricaPressao}` : ""}
            </div>
          </>
        ) : (
          <div className="mt-1 text-xs text-text-muted">Nenhum projeto acima do orçamento</div>
        )}
      </Card>

      <Card>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Folga parada</div>
        <div className="mt-1 text-2xl font-bold text-text" title={fmtBRL(pf.folgaParada)}>
          {fmtBRL(pf.folgaParada, true)}
        </div>
        <div className="text-xs text-text-muted">remanejável</div>
        <div className="mt-1 text-[11px] text-text-faint">
          {plural(pf.projetosParados)} · sem compromisso há 6+ meses
        </div>
      </Card>
    </div>
  );
}
