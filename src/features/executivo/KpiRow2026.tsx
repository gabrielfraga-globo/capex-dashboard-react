import { FolderKanban, Wallet, ShieldAlert, Gauge, CheckCircle2 } from "lucide-react";
import { fmtBRL } from "../../lib/format";
import { KpiStat } from "../../components/ui/pattern/KpiStat";
import { FlipCard } from "../../components/ui/FlipCard";
import { LABELS } from "../../config/labels";
import { InfoTooltip } from "../../components/ui/primitives";
import { SaldoPotencialCard } from "../saldo/SaldoPotencialCard";
import { formatarDiaMes, type ExplicacaoCompromisso } from "./compromissoExplicacao";
import type { CarteiraResumoData } from "./useCarteiraResumo";

function ExplicacaoTooltipContent({
  explicacao,
  dataRef,
  notaAbertura,
}: {
  explicacao: ExplicacaoCompromisso;
  dataRef: Date;
  notaAbertura?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p>
        Classificamos cada RC pela data estimada de pagamento, a partir da etapa da esteira. Pagamento até 31/12 conta em
        2026; depois, em 2027. A decisão do gestor na Curadoria prevalece.
      </p>
      <ul className="flex flex-col gap-1 tabular-nums">
        {explicacao.linhas.map((l) => (
          <li key={l.rotulo} className="flex items-baseline justify-between gap-3">
            <span>{l.rotulo}</span>
            <span className="font-semibold">{fmtBRL(l.valor, true)}</span>
            <span className="text-text-muted whitespace-nowrap">{l.qtd === 1 ? "1 RC" : `${l.qtd} RCs`}</span>
          </li>
        ))}
      </ul>
      {notaAbertura && <p className="text-text-muted">{notaAbertura}</p>}
      <p className="text-text-faint">Estimativa de {formatarDiaMes(dataRef)}</p>
    </div>
  );
}

interface KpiRow2026Props {
  data: CarteiraResumoData;
  rubricas: string[];
  onAbrirRisco: () => void;
}

/** Fileira de KPIs do ano 2026 da Visão Executiva. Renderiza fragmento (sem wrapper). */
export function KpiRow2026({ data, rubricas, onAbrirRisco }: KpiRow2026Props) {
  const { bgVivoSum, explicacaoCompromisso, compromisso27, notaVirada, dbDate, risk, saldoProjectKeys } = data;

  const emRiscoKpi = (
    <KpiStat
      icon={<ShieldAlert size={16} />}
      label="Em risco"
      value={fmtBRL(risk.totalValue, true)}
      tone="warn"
      context={
        <span className="inline-flex items-center gap-1">
          {`${risk.count} projetos`}
          <InfoTooltip label="Sobre o Em risco" text="Parte do Compromisso 26 que pode não virar caixa em 2026: RCs em etapas iniciais (E1–E3), atrasadas na E4 ou com previsão marcada como incerta na Curadoria. Clique para ver os projetos." />
        </span>
      }
      onClick={onAbrirRisco}
    />
  );

  return (
    <>
      <KpiStat
        icon={<FolderKanban size={16} />}
        label="BG Gov 26"
        value={fmtBRL(bgVivoSum.bgGov, true)}
        context={`BG Vivo ${fmtBRL(bgVivoSum.bgVivo, true)} (${bgVivoSum.diferencaVsGov >= 0 ? "+" : ""}${fmtBRL(bgVivoSum.diferencaVsGov, true)})`}
      />
      <KpiStat icon={<CheckCircle2 size={16} />} label="Realizado 26" value={fmtBRL(bgVivoSum.realizado, true)} context="pago no exercício" />
      <KpiStat icon={<Gauge size={16} />} label="Em pagamento" value={fmtBRL(bgVivoSum.emPagamento, true)} context="etapa E7" />
      <KpiStat
        icon={<Wallet size={16} />}
        label={
          <span className="inline-flex items-center gap-1">
            Compromisso 26
            <InfoTooltip
              label="Como calculamos o Compromisso 26"
              content={<ExplicacaoTooltipContent explicacao={explicacaoCompromisso.c26} dataRef={dbDate} />}
            />
          </span>
        }
        value={fmtBRL(bgVivoSum.emitido, true)}
        context="emitido na carteira"
      />
      <KpiStat
        icon={<Wallet size={16} />}
        label={
          <span className="inline-flex items-center gap-1">
            Compromisso 27
            <InfoTooltip
              label="Como calculamos o Compromisso 27"
              content={
                <ExplicacaoTooltipContent
                  explicacao={explicacaoCompromisso.c27}
                  dataRef={dbDate}
                  notaAbertura={notaVirada}
                />
              }
            />
          </span>
        }
        value={fmtBRL(compromisso27, true)}
        context="RCs com caixa previsto em 2027"
      />
      {import.meta.env.VITE_FEATURE_SALDO_PROJETOS === "true" ? (
        <FlipCard
          compact
          frontLabel="Em risco"
          backLabel={LABELS.saldoParadoCard}
          front={emRiscoKpi}
          back={
            <SaldoPotencialCard
              variant="flip"
              projectKeys={saldoProjectKeys}
              rubricas={rubricas}
              anoSelecionado={2026}
            />
          }
        />
      ) : emRiscoKpi}
    </>
  );
}
