import type { SaldoRecorteView, SaldoSignal } from "../radar/types";
import { Card } from "../../components/ui/primitives";
import { fmtBRL, fmtPct } from "../../lib/format";

const SIGNAL_LABEL: Record<SaldoSignal, string> = {
  ESTOURO_CAIXA: "Estouro de caixa",
  SEM_ORCAMENTO: "Sem orçamento",
  COMPROMETIDO_ACIMA: "Comprometido acima",
  SALDO_PARADO: "Saldo parado",
  SALDO_RESIDUAL: "Saldo residual",
  EM_EXECUCAO: "Em execução",
};

const SIGNAL_TONE: Record<SaldoSignal, string> = {
  ESTOURO_CAIXA: "border-risk-critico text-risk-critico",
  SEM_ORCAMENTO: "border-border text-text-muted",
  COMPROMETIDO_ACIMA: "border-risk-alto text-risk-alto",
  SALDO_PARADO: "border-risk-medio text-risk-medio",
  SALDO_RESIDUAL: "border-risk-revisao text-risk-revisao",
  EM_EXECUCAO: "border-risk-baixo text-risk-baixo",
};

const SEGMENTO = {
  caixa: "bg-accent",
  compromisso: "bg-text-faint",
  saldo: "bg-risk-baixo",
} as const;

export interface RubricaRiskPanelProps {
  views: SaldoRecorteView[];
  selected: string[];
  onToggle: (rubrica: string) => void;
}

export function RubricaRiskPanel({ views, selected, onToggle }: RubricaRiskPanelProps) {
  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Risco por rubrica</div>
        <div className="text-xs text-text-faint">Clique para filtrar a página</div>
      </div>
      {views.length === 0 ? (
        <div className="text-sm text-text-muted">Nenhuma rubrica no recorte atual.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {views.map((v) => {
            const ativa = selected.includes(v.key);
            const orcamento = v.orcamento;
            const caixaPos = Math.max(0, v.caixa);
            const compPos = Math.max(0, v.compromissoValido);
            const saldoPos = Math.max(0, v.saldoDisponivel);
            const escala = Math.max(orcamento, caixaPos + compPos + saldoPos, 1);
            const w = (x: number) => `${(x / escala) * 100}%`;
            const acima = v.saldoDisponivel < 0;
            return (
              <li key={v.key}>
                <button
                  type="button"
                  aria-pressed={ativa}
                  onClick={() => onToggle(v.key)}
                  className={`w-full rounded-md border p-3 text-left transition-colors hover:bg-card-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${ativa ? "border-accent bg-card-alt" : "border-border"}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-text">{v.key}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${SIGNAL_TONE[v.signal]}`}>
                      {SIGNAL_LABEL[v.signal]}
                    </span>
                  </div>
                  <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-card" aria-hidden="true">
                    <div className={SEGMENTO.caixa} style={{ width: w(caixaPos) }} />
                    <div className={SEGMENTO.compromisso} style={{ width: w(compPos) }} />
                    <div className={SEGMENTO.saldo} style={{ width: w(saldoPos) }} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted tabular-nums">
                    <span>Caixa {fmtBRL(v.caixa, true)} ({fmtPct(v.pctCaixa)})</span>
                    <span>Comp. válido {fmtBRL(v.compromissoValido, true)}</span>
                    <span className={v.saldoDisponivel < 0 ? "text-risk-critico" : ""}>
                      Saldo disp. {fmtBRL(v.saldoDisponivel, true)} ({fmtPct(v.pctSaldo)})
                      {acima && <span className="ml-1">· acima do orçamento</span>}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
