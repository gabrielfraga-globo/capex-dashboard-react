import { useMemo, useState } from "react";
import { Card, InfoTooltip } from "../../components/ui/primitives";
import { ProjectListModal, type ColunaProjetoLista } from "../../components/ProjectListModal";
import { fmtBRL, fmtPct, formatCurrencyMillions } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { ProjetoMetricas } from "../../types";
import type { OperationalRow } from "../radar/operational";
import { simularBG, triIgualAno, type Horizonte, type StatusAderencia } from "./simulador";

export interface AderenciaPlanoProps {
  projetos: ProjetoMetricas[];
  rows: OperationalRow[];
  dataRef: Date;
  exerciseYear: number;
  bgGov: number;
  onSelectProject: (p: ProjetoMetricas) => void;
}

const HORIZONTES: Array<{ h: Horizonte; rotulo: string }> = [
  { h: "hoje", rotulo: "Hoje" },
  { h: "mes", rotulo: "Fim do mês" },
  { h: "tri", rotulo: "Fim do tri" },
  { h: "ano", rotulo: "Fim do ano" },
];

const ORDEM_STATUS: StatusAderencia[] = ["NO_RITMO", "ANTECIPANDO", "POSTERGANDO"];

const ESTILO_STATUS: Record<StatusAderencia, { rotulo: string; cor: string }> = {
  NO_RITMO: { rotulo: "No ritmo", cor: "bg-slate-600" },
  ANTECIPANDO: { rotulo: "Antecipando", cor: "bg-warn" },
  POSTERGANDO: { rotulo: "Postergando", cor: "bg-crit" },
};

const CHAVE_GRUPO = { NO_RITMO: "noRitmo", ANTECIPANDO: "antecipando", POSTERGANDO: "postergando" } as const;

/** Fatia mínima da barra (%) para exibir o rótulo de percentual dentro dela. */
const LIMITE_ROTULO_BARRA_PCT = 10;

/** Variação em R$ milhões com sinal explícito; zero sem sinal. */
function deltaMilhoes(v: number): string {
  if (v === 0) return formatCurrencyMillions(0);
  return `${v > 0 ? "+" : "−"}${formatCurrencyMillions(Math.abs(v))}`;
}

function deltaCompacto(v: number): string {
  return `${v > 0 ? "+" : ""}${fmtBRL(v, true)}`;
}

function corDesvio(v: number | undefined): string {
  if (v === undefined || v === 0) return "";
  return v > 0 ? "text-warn" : "text-crit";
}

export function AderenciaPlano({
  projetos,
  rows,
  dataRef,
  exerciseYear,
  bgGov,
  onSelectProject,
}: AderenciaPlanoProps) {
  const [horizonteSel, setHorizonteSel] = useState<Horizonte>("ano");
  const [incluirRisco, setIncluirRisco] = useState(true);
  const [grupoAberto, setGrupoAberto] = useState<StatusAderencia | null>(null);

  const temTri = !triIgualAno(dataRef, exerciseYear);
  const h: Horizonte = horizonteSel === "tri" && !temTri ? "ano" : horizonteSel;

  const sim = useMemo(
    () => simularBG({ projetos, rows, h, ref: dataRef, exerciseYear, incluirRisco }),
    [projetos, rows, h, dataRef, exerciseYear, incluirRisco]
  );

  const itemPorId = useMemo(() => new Map(sim.itens.map((it) => [it.id, it])), [sim.itens]);
  const projetoPorId = useMemo(() => new Map(projetos.map((p) => [p.id, p])), [projetos]);

  const listaGrupo = useMemo<ProjetoMetricas[]>(() => {
    if (!grupoAberto) return [];
    return sim.itens
      .filter((it) => it.status === grupoAberto)
      .map((it) => projetoPorId.get(it.id))
      .filter((p): p is ProjetoMetricas => p !== undefined);
  }, [grupoAberto, sim.itens, projetoPorId]);

  const valorDesvio = useMemo(() => (p: ProjetoMetricas) => itemPorId.get(p.id)?.desvio ?? null, [itemPorId]);

  const colunas = useMemo<ColunaProjetoLista[]>(
    () => [
      { header: "Responsável", valor: (p) => p.gestor ?? "–" },
      { header: "Plano", valor: (p) => fmtBRL(itemPorId.get(p.id)?.plano, true), alinhar: "right" },
      { header: "Projetado", valor: (p) => fmtBRL(itemPorId.get(p.id)?.projetado, true), alinhar: "right" },
      {
        header: "Desvio",
        valor: (p) => {
          const d = itemPorId.get(p.id)?.desvio;
          return <span className={corDesvio(d)}>{d === undefined ? "–" : deltaCompacto(d)}</span>;
        },
        alinhar: "right",
      },
    ],
    [itemPorId]
  );

  const { plano, projetado, grupos } = sim;
  const total = sim.itens.length;
  const qtdPorStatus = (st: StatusAderencia) => grupos[CHAVE_GRUPO[st]].qtd;
  const desvioPorStatus = (st: StatusAderencia) => grupos[CHAVE_GRUPO[st]].desvio;
  const percentualNoRitmo = total > 0 ? fmtPct(qtdPorStatus("NO_RITMO") / total, 0) : "–";

  const bgReferencia = h === "hoje" ? plano : bgGov;
  const deltaReferencia = projetado - bgReferencia;
  const textoReferencia = h === "hoje" ? "vs plano até hoje" : "vs BG";

  return (
    <Card>
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-text-muted font-semibold">
        ADERÊNCIA AO PLANO
        <InfoTooltip text="Caixa projetado pelo empenho contra o caixa planejado até o horizonte. Antecipando: acima do plano. Postergando: abaixo." />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Horizonte" className="inline-flex rounded-full border border-border bg-card-alt p-0.5">
          {HORIZONTES.filter((o) => o.h !== "tri" || temTri).map((o) => (
            <button
              key={o.h}
              type="button"
              aria-pressed={h === o.h}
              onClick={() => setHorizonteSel(o.h)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                h === o.h ? "bg-accent text-white" : "text-text-muted hover:text-text"
              )}
            >
              {o.rotulo}
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text">
          <input
            type="checkbox"
            checked={incluirRisco}
            onChange={(e) => setIncluirRisco(e.target.checked)}
            className="h-3.5 w-3.5 accent-accent"
          />
          com risco
        </label>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[40px] font-bold leading-none tabular-nums text-text">{percentualNoRitmo}</span>
        <span className="text-xs text-text-muted">dos projetos no ritmo</span>
      </div>

      <div
        role="img"
        aria-label={`Projetos: ${qtdPorStatus("NO_RITMO")} no ritmo, ${qtdPorStatus("ANTECIPANDO")} antecipando, ${qtdPorStatus("POSTERGANDO")} postergando`}
        className="mt-2 flex h-4 overflow-hidden rounded bg-card-alt"
      >
        {ORDEM_STATUS.map((st) => {
          const qtd = qtdPorStatus(st);
          if (qtd === 0 || total === 0) return null;
          const pctSeg = (qtd / total) * 100;
          return (
            <div
              key={st}
              className={cn("flex items-center justify-center text-[10px] font-semibold tabular-nums text-white", ESTILO_STATUS[st].cor)}
              style={{ width: `${pctSeg}%` }}
            >
              {pctSeg >= LIMITE_ROTULO_BARRA_PCT ? `${Math.round(pctSeg)}%` : null}
            </div>
          );
        })}
      </div>

      <ul className="mt-2">

        {ORDEM_STATUS.map((st) => {
          const desvio = desvioPorStatus(st);
          return (
            <li key={st}>
              <button
                type="button"
                onClick={() => setGrupoAberto(st)}
                aria-label={`${ESTILO_STATUS[st].rotulo}: ${qtdPorStatus(st)} projetos, abrir lista`}
                className="grid w-full grid-cols-[12px_minmax(0,1fr)_auto_96px] items-center gap-2 rounded-md px-1 py-0.5 text-xs hover:bg-card-alt focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span className={cn("h-2.5 w-2.5 rounded-full", ESTILO_STATUS[st].cor)} aria-hidden />
                <span className="truncate text-text">{ESTILO_STATUS[st].rotulo}</span>
                <span className="tabular-nums text-text-muted">{qtdPorStatus(st)} proj.</span>
                <span
                  className={cn(
                    "text-right font-semibold tabular-nums",
                    st === "NO_RITMO" ? "text-text-muted" : corDesvio(desvio) || "text-text-muted"
                  )}
                >
                  {deltaMilhoes(desvio)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-1 flex items-center justify-between gap-3 border-t border-border-subtle pt-1">
        <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold">BG vivo simulado</p>
        <p className="text-xs tabular-nums text-text-muted">
          <span className="font-semibold text-text">{formatCurrencyMillions(projetado)}</span> · {deltaMilhoes(deltaReferencia)} {textoReferencia}
        </p>
      </div>

      <ProjectListModal
        open={grupoAberto !== null}
        onClose={() => setGrupoAberto(null)}
        title={grupoAberto ? `${ESTILO_STATUS[grupoAberto].rotulo} · ${sim.label}` : "Projetos"}
        projetos={listaGrupo}
        valorFn={valorDesvio}
        colunas={colunas}
        onSelectProject={onSelectProject}
      />
    </Card>
  );
}
