import { Card } from "../../components/ui/primitives";
import { fmtBRL } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { ResumoPlurianual } from "./plurianual";

const plural = (n: number): string => `${n} ${n === 1 ? "projeto" : "projetos"}`;

export function RiscoKpisPlurianual({ resumo }: { resumo: ResumoPlurianual }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Card>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Estouro de caixa</div>
        <div
          className={cn("mt-1 text-2xl font-bold", resumo.estouroCaixa > 0 ? "text-risk-critico" : "text-text")}
          title={fmtBRL(resumo.estouroCaixa)}
        >
          {fmtBRL(resumo.estouroCaixa, true)}
        </div>
        <div className="mt-1 text-[11px] text-text-faint">
          {plural(resumo.nEstouro)} · caixa acima do plurianual em mais de R$ 100 mil
        </div>
      </Card>

      <Card>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Comprometido acima</div>
        <div
          className={cn("mt-1 text-2xl font-bold", resumo.comprometidoAcima > 0 ? "text-risk-medio" : "text-text")}
          title={fmtBRL(resumo.comprometidoAcima)}
        >
          {fmtBRL(resumo.comprometidoAcima, true)}
        </div>
        <div className="mt-1 text-[11px] text-text-faint">{plural(resumo.nComprometido)} · caixa + compromisso acima</div>
      </Card>

      <Card>
        <div className="flex items-center gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Folga parada</div>
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-text-muted">2026</span>
        </div>
        <div className="mt-1 text-2xl font-bold text-text" title={fmtBRL(resumo.folgaParada)}>
          {fmtBRL(resumo.folgaParada, true)}
        </div>
        <div className="mt-1 text-[11px] text-text-faint">{plural(resumo.nParados)} · 6+ meses sem compromisso</div>
      </Card>
    </div>
  );
}
