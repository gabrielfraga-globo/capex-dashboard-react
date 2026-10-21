import { useMemo, useState, type KeyboardEvent } from "react";
import { RefreshCw } from "lucide-react";
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
  ref: Date;
  exerciseYear: number;
  bgGov: number;
  bgVivoTimes: number;
  onSelectProject: (p: ProjetoMetricas) => void;
}

const HORIZONTES: Array<{ h: Horizonte; rotulo: string }> = [
  { h: "hoje", rotulo: "Hoje" },
  { h: "mes", rotulo: "Fim do mês" },
  { h: "tri", rotulo: "Fim do tri" },
  { h: "ano", rotulo: "Fim do ano" },
];

const ORDEM_STATUS: StatusAderencia[] = ["NO_RITMO", "ANTECIPANDO", "POSTERGANDO"];

const ESTILO_STATUS: Record<StatusAderencia, { rotulo: string; dot: string; stroke: string }> = {
  NO_RITMO: { rotulo: "No ritmo", dot: "bg-ok", stroke: "stroke-ok" },
  ANTECIPANDO: { rotulo: "Antecipando", dot: "bg-warn", stroke: "stroke-warn" },
  POSTERGANDO: { rotulo: "Postergando", dot: "bg-crit", stroke: "stroke-crit" },
};

const CHAVE_GRUPO = { NO_RITMO: "noRitmo", ANTECIPANDO: "antecipando", POSTERGANDO: "postergando" } as const;

const RAIO_ROSCA = 40;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO_ROSCA;

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

/** Converte a data ISO (yyyy-mm-dd) do horizonte em dd/mm. */
function dataCurta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function LinhaPonte({
  rotulo,
  offset,
  largura,
  barra,
  valor,
  fina = false,
  descricao,
  onAbrir,
}: {
  rotulo: string;
  offset: number;
  largura: number;
  barra: string;
  valor: string;
  fina?: boolean;
  descricao?: string;
  onAbrir?: () => void;
}) {
  const base = "grid grid-cols-[112px_minmax(0,1fr)_96px] items-center gap-3 rounded-md px-1 py-1";
  const corpo = (
    <>
      <span className="truncate text-[11px] text-text-muted">{rotulo}</span>
      <div className="relative h-3 rounded bg-card-alt">
        <div
          className={cn("absolute rounded", barra, fina ? "top-1/2 h-[2px] -translate-y-1/2" : "inset-y-0")}
          style={{ left: `${offset}%`, width: `${largura}%` }}
        />
      </div>
      <span className="text-right text-xs font-semibold tabular-nums text-text">{valor}</span>
    </>
  );

  if (!onAbrir) return <div className={base}>{corpo}</div>;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={descricao}
      onClick={onAbrir}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAbrir();
        }
      }}
      className={cn(
        base,
        "cursor-pointer hover:bg-card-alt focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      )}
    >
      {corpo}
    </div>
  );
}

export function AderenciaPlano({
  projetos,
  rows,
  ref: dataRef,
  exerciseYear,
  bgGov,
  bgVivoTimes,
  onSelectProject,
}: AderenciaPlanoProps) {
  const [horizonteSel, setHorizonteSel] = useState<Horizonte>("ano");
  const [incluirRisco, setIncluirRisco] = useState(true);
  const [face, setFace] = useState<"financeira" | "quantidade">("financeira");
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
  const postergado = Math.abs(grupos.postergando.desvio);
  const antecipado = grupos.antecipando.desvio;
  const noRitmo = grupos.noRitmo.desvio;

  // Escala comum a todas as barras da ponte.
  const escala = Math.max(plano, projetado, plano + antecipado, 1);
  const pct = (v: number) => Math.max(0, Math.min(100, (v / escala) * 100));
  const offsetPostergado = pct(Math.max(0, plano - postergado));
  const larguraPlano = pct(plano);
  const inicioNoRitmo = pct(Math.max(0, Math.min(plano, plano + noRitmo)));

  const total = sim.itens.length;
  const qtdPorStatus = (st: StatusAderencia) => grupos[CHAVE_GRUPO[st]].qtd;
  const percentualNoRitmo = total > 0 ? fmtPct(qtdPorStatus("NO_RITMO") / total, 0) : "–";

  const fracoesRosca = ORDEM_STATUS.map((st) => (total > 0 ? qtdPorStatus(st) / total : 0));
  const inicioRosca = fracoesRosca.map((_, i) => fracoesRosca.slice(0, i).reduce((s, f) => s + f, 0));
  const segmentosRosca = ORDEM_STATUS.map((st, i) => {
    const qtd = qtdPorStatus(st);
    if (qtd === 0 || total === 0) return null;
    const comprimento = fracoesRosca[i] * CIRCUNFERENCIA;
    const deslocamento = -inicioRosca[i] * CIRCUNFERENCIA;
    return (
      <circle
        key={st}
        cx={50}
        cy={50}
        r={RAIO_ROSCA}
        fill="none"
        strokeWidth={14}
        className={ESTILO_STATUS[st].stroke}
        strokeDasharray={`${comprimento} ${CIRCUNFERENCIA}`}
        strokeDashoffset={deslocamento}
      />
    );
  });

  const comparacao =
    h === "hoje" ? (
      <>vs plano até hoje {deltaMilhoes(projetado - plano)}</>
    ) : (
      <>
        vs BG Gov {deltaMilhoes(projetado - bgGov)} · vs BG Vivo (times) {deltaMilhoes(projetado - bgVivoTimes)}
      </>
    );

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-text-muted font-semibold">
          ADERÊNCIA AO PLANO
          <InfoTooltip text="Caixa projetado pelo empenho contra o caixa planejado até o horizonte. Antecipando: acima do plano. Postergando: abaixo." />
        </div>

        <div className="flex flex-wrap items-center gap-2">
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

          <button
            type="button"
            role="switch"
            aria-checked={incluirRisco}
            onClick={() => setIncluirRisco((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text"
          >
            <span className={cn("relative inline-block h-4 w-7 rounded-full transition-colors", incluirRisco ? "bg-info" : "bg-border")}>
              <span
                className={cn(
                  "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform",
                  incluirRisco ? "translate-x-3.5" : "translate-x-0.5"
                )}
              />
            </span>
            Considerar em risco
          </button>

          <button
            type="button"
            aria-pressed={face === "quantidade"}
            aria-label={face === "financeira" ? "Ver quantidade de projetos por ritmo" : "Ver balanço financeiro"}
            onClick={() => setFace((f) => (f === "financeira" ? "quantidade" : "financeira"))}
            className="rounded p-1 text-text-muted hover:text-text"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {face === "financeira" ? (
        <>
          <div className="mt-4 space-y-1">
            <LinhaPonte
              rotulo={`Plano até ${dataCurta(sim.fim)}`}
              offset={0}
              largura={larguraPlano}
              barra="bg-text-muted opacity-40"
              valor={formatCurrencyMillions(plano)}
            />
            <LinhaPonte
              rotulo="Postergando"
              offset={offsetPostergado}
              largura={Math.max(0, larguraPlano - offsetPostergado)}
              barra="bg-crit"
              valor={deltaMilhoes(-postergado)}
              descricao="Postergando: abrir lista de projetos"
              onAbrir={() => setGrupoAberto("POSTERGANDO")}
            />
            <LinhaPonte
              rotulo="Antecipando"
              offset={larguraPlano}
              largura={pct(Math.max(0, antecipado))}
              barra="bg-warn"
              valor={deltaMilhoes(antecipado)}
              descricao="Antecipando: abrir lista de projetos"
              onAbrir={() => setGrupoAberto("ANTECIPANDO")}
            />
            <LinhaPonte
              rotulo="± No ritmo"
              offset={inicioNoRitmo}
              largura={Math.max(pct(Math.abs(noRitmo)), 0.6)}
              barra="bg-text-muted"
              fina
              valor={deltaMilhoes(noRitmo)}
              descricao="No ritmo: abrir lista de projetos"
              onAbrir={() => setGrupoAberto("NO_RITMO")}
            />
            <LinhaPonte
              rotulo="= BG vivo"
              offset={0}
              largura={pct(projetado)}
              barra="bg-info"
              valor={formatCurrencyMillions(projetado)}
            />
          </div>

          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold">BG vivo simulado</p>
            <p className="text-3xl font-bold tabular-nums text-text">{formatCurrencyMillions(projetado)}</p>
            <p className="text-[11px] text-text-faint mt-1">{comparacao}</p>
          </div>
        </>
      ) : (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wide text-text-muted font-semibold">PROJETOS POR RITMO</p>
          <div className="mt-3 flex items-center gap-5">
            <div className="relative h-32 w-32 shrink-0">
              <svg
                viewBox="0 0 100 100"
                className="h-full w-full -rotate-90"
                role="img"
                aria-label={`Projetos: ${qtdPorStatus("NO_RITMO")} no ritmo, ${qtdPorStatus("ANTECIPANDO")} antecipando, ${qtdPorStatus("POSTERGANDO")} postergando`}
              >
                <circle cx={50} cy={50} r={RAIO_ROSCA} fill="none" strokeWidth={14} className="stroke-border-subtle" />
                {segmentosRosca}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-text">{percentualNoRitmo}</span>
                <span className="text-[10px] text-text-muted">no ritmo</span>
              </div>
            </div>

            <ul className="flex-1 space-y-1">
              {ORDEM_STATUS.map((st) => {
                const qtd = qtdPorStatus(st);
                return (
                  <li key={st}>
                    <button
                      type="button"
                      onClick={() => setGrupoAberto(st)}
                      className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-card-alt"
                    >
                      <span className="flex items-center gap-2 text-text">
                        <span className={cn("h-2.5 w-2.5 rounded-full", ESTILO_STATUS[st].dot)} aria-hidden />
                        {ESTILO_STATUS[st].rotulo}
                      </span>
                      <span className="tabular-nums text-text-muted font-semibold">
                        {qtd} · {total > 0 ? fmtPct(qtd / total, 0) : "–"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

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
