import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button, Card } from "../../components/ui/primitives";
import { fmtBRL, fmtNumber, fmtPct } from "../../lib/format";
import { navigate } from "../../lib/simpleRouter";
import { useCuration } from "./useCuration";
import { poStatusLabel } from "./status";
import { RADAR_CARD_BUCKETS } from "./types";

function Stat({ label, value, sub, tone = "text-text" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-card border border-border bg-card-alt/70 p-3 shadow-card-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`mt-2 text-xl font-extrabold leading-none ${tone}`}>{value}</div>
      {sub && <div className="mt-1 text-[11px] text-text-faint">{sub}</div>}
    </div>
  );
}

export function CashRiskBanner() {
  const { isLoading, error, bundle, resumo } = useCuration();

  if (isLoading) {
    return (
      <div className="mb-4 rounded-card border border-border bg-card-alt p-4 animate-pulse" aria-live="polite" aria-busy="true">
        <div className="h-4 w-32 rounded bg-card mb-3" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-20 rounded-card bg-card" aria-hidden="true" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !bundle || !resumo) {
    return (
      <div className="mb-4">
        <Card className="border-risk-critico">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 text-risk-critico" size={16} aria-hidden="true" />
            <div>
              <div className="text-sm font-semibold text-risk-critico">Não foi possível carregar o risco de caixa</div>
              <div className="text-xs text-text-muted mt-1">{error ?? "Dados do radar indisponíveis no momento."}</div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const bgSistema = bundle.totals.value;
  const bgTimes = resumo.buckets[RADAR_CARD_BUCKETS.bgTimes];
  const gap = bgTimes - bgSistema;
  const gapPct = bgSistema ? gap / bgSistema : 0;
  const gapTone = gap >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  const gapValue = `${gap >= 0 ? "+" : "-"}${fmtBRL(Math.abs(gap), true)}`;

  if (!resumo.reconciles) {
    return (
      <div className="mb-4">
        <Card className="border-risk-critico bg-red-500/5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 text-risk-critico" size={16} aria-hidden="true" />
              <div>
                <div className="text-sm font-semibold text-risk-critico">Reconciliamento falhou no merge do Radar</div>
                <div className="text-xs text-text-muted mt-1">
                  Os baldes de caixa não batem com o total do BI. Os KPIs foram ocultados até a inconsistência da origem ser corrigida.
                </div>
              </div>
            </div>
            <Button type="button" onClick={() => navigate("/radar")} className="whitespace-nowrap">
              Abrir Radar
              <ArrowRight size={14} className="ml-1.5" aria-hidden="true" />
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-card border border-border bg-gradient-to-r from-card-alt via-card to-card-alt p-3 shadow-card">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Risco de Caixa</div>
          <div className="text-sm text-text-faint">Resumo executivo do radar</div>
        </div>

        <Button type="button" onClick={() => navigate("/radar")} className="whitespace-nowrap">
          Abrir Radar
          <ArrowRight size={14} className="ml-1.5" aria-hidden="true" />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="BG Sistêmico" value={fmtBRL(bgSistema, true)} sub="BI total" />
        <Stat label={poStatusLabel("CONFIRMED", resumo.exerciseYear)} value={fmtBRL(bgTimes, true)} sub="curadoria do exercício" />
        <Stat label="Gap" value={gapValue} sub={`${fmtPct(gapPct)} vs. sistêmico`} tone={gapTone} />
        <Stat
          label={poStatusLabel("CARRYOVER", resumo.exerciseYear)}
          value={fmtBRL(resumo.buckets[RADAR_CARD_BUCKETS.carryover], true)}
          sub="pagamento previsto após o exercício"
        />
        <Stat
          label="Cobertura"
          value={fmtPct(resumo.coverage.ratio)}
          sub={`${fmtNumber(resumo.coverage.curatedKeys)}/${fmtNumber(resumo.coverage.totalKeys)} avaliadas`}
        />
      </div>
    </div>
  );
}
