import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatCurrencyMillions } from "../lib/format";
import { generateRiskSummary } from "../lib/insights";
import { SkeletonBlock } from "./ui/SkeletonCard";
import { LABELS } from "../config/labels";
import { ProjectListModal } from "./ProjectListModal";
import type { KPIEstrategicoCarteira, ProjetoMetricas } from "../types";

type Foco = "todos" | "dentro" | "acompanhar" | "acao" | "faltantes" | "excedentes" | "semOrcamento";

type ChaveRitmo = "dentro" | "acompanhar" | "acao";

const ROTULOS_RITMO: Record<"padrao" | "tatica", Record<ChaveRitmo, string>> = {
  padrao: { dentro: "No ritmo", acompanhar: "Acompanhar", acao: "Abaixo do ritmo" },
  tatica: { dentro: "Sem alerta", acompanhar: "Acompanhar", acao: "Ação necessária" },
};

function kpiSeverity(status: KPIEstrategicoCarteira["status"] | undefined): number {
  if (!status || status === "nd" || status === "verde") return 0;
  if (status === "amarelo") return 1;
  return 2;
}

export function AnaliseRiscoPanel({
  lista,
  kpisEstrategicos,
  isLoadingCompromisso,
  onSelectProject,
  somenteStatus = false,
  mostrarSemOrcamento = false,
  variante = "padrao",
}: {
  lista: ProjetoMetricas[];
  kpisEstrategicos: KPIEstrategicoCarteira[];
  isLoadingCompromisso?: boolean;
  onSelectProject: (p: ProjetoMetricas) => void;
  somenteStatus?: boolean;
  /** Mostra a 4ª linha neutra com os projetos sem orçamento 26 (status "Dados insuficientes"). */
  mostrarSemOrcamento?: boolean;
  /** "tatica" usa os rótulos Sem alerta / Acompanhar / Ação necessária. */
  variante?: "padrao" | "tatica";
}) {
  const [foco, setFoco] = useState<Foco>("todos");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalFoco, setModalFoco] = useState<Foco | null>(null);
  const rotulos = ROTULOS_RITMO[variante];

  const semOrcamento = useMemo(() => lista.filter((p) => p.status === "Dados insuficientes"), [lista]);

  const saude = useMemo(() => {
    const normal = lista.filter((p) => p.status === "Normal");
    const acompanhar = lista.filter((p) => p.status === "Revisar Caixa Ano");
    const acao = lista.filter((p) => p.status === "Estouro" || p.status === "Risco de Não Realização");
    const sum = (arr: ProjetoMetricas[]) => arr.reduce((a, p) => a + (p.orcamentoPeriodo ?? 0), 0);
    return {
      dentro: { n: normal.length, valor: sum(normal) },
      acompanhar: { n: acompanhar.length, valor: sum(acompanhar) },
      acao: { n: acao.length, valor: sum(acao) },
    };
  }, [lista]);

  const risco = useMemo(() => generateRiskSummary(lista), [lista]);

  const caixaKpi = useMemo(
    () => kpisEstrategicos.find((kpi) => kpi.id === "velocidadeCaixa") ?? null,
    [kpisEstrategicos]
  );
  const empenhoKpi = useMemo(
    () => kpisEstrategicos.find((kpi) => kpi.id === "empenho") ?? null,
    [kpisEstrategicos]
  );
  const principalAlerta = useMemo(() => {
    const caixaSeverity = kpiSeverity(caixaKpi?.status);
    const empenhoSeverity = kpiSeverity(empenhoKpi?.status);

    if (caixaSeverity === 0 && empenhoSeverity === 0) {
      return { tipo: "none" as const, titulo: "Nenhum alerta ativo" };
    }

    const alvo =
      empenhoSeverity >= caixaSeverity
        ? { nome: "Empenho", statusLabel: empenhoKpi?.statusLabel ?? "Atenção" }
        : { nome: "Caixa", statusLabel: caixaKpi?.statusLabel ?? "Atenção" };

    return {
      tipo: "alert" as const,
      titulo: `${alvo.nome}: ${alvo.statusLabel}`,
    };
  }, [caixaKpi?.status, caixaKpi?.statusLabel, empenhoKpi?.status, empenhoKpi?.statusLabel]);

  const listaModalFoco = useMemo(() => {
    if (!modalFoco) return [];
    if (modalFoco === "dentro") return lista.filter((p) => p.status === "Normal");
    if (modalFoco === "acompanhar") return lista.filter((p) => p.status === "Revisar Caixa Ano");
    if (modalFoco === "acao") return lista.filter((p) => p.status === "Estouro" || p.status === "Risco de Não Realização");
    if (modalFoco === "faltantes") return lista.filter((p) => p.status === "Risco de Não Realização");
    if (modalFoco === "excedentes") return lista.filter((p) => p.status === "Estouro" || p.status === "Revisar Caixa Ano");
    if (modalFoco === "semOrcamento") return semOrcamento;
    return lista;
  }, [modalFoco, lista, semOrcamento]);

  const modalTitle = {
    todos: "Projetos",
    dentro: rotulos.dentro,
    acompanhar: rotulos.acompanhar,
    acao: rotulos.acao,
    faltantes: "Emissões faltantes",
    excedentes: "Emissões excedentes",
    semOrcamento: `${LABELS.semOrcamento26}`,
  }[modalFoco ?? "todos"];

  const modalValorFn = (p: ProjetoMetricas): number | null => {
    if (modalFoco === "faltantes") return p.aEmitir ?? 0;
    if (modalFoco === "excedentes") return (p.executado ?? 0) - (p.realizadoAcumulado ?? 0);
    return p.orcamentoPeriodo ?? 0;
  };

  const modalJustificativaFn = (p: ProjetoMetricas): string => {
    if (modalFoco === "faltantes") return `A emitir: ${formatCurrencyMillions(p.aEmitir ?? 0)}`;
    if (modalFoco === "excedentes") return `Empenho: ${formatCurrencyMillions((p.executado ?? 0) - (p.realizadoAcumulado ?? 0))}`;
    return `Orçamento: ${formatCurrencyMillions(p.orcamentoPeriodo ?? 0)}`;
  };

  return (
    <aside className="rounded-card border border-border bg-card p-2 shadow-card flex flex-col gap-2 overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
      <div>
        <p className="text-sm font-semibold text-text">Ritmo de execução</p>
      </div>

      <section className="space-y-1">
        <p className="text-xs font-semibold text-text">Status Geral</p>
        {(["dentro", "acompanhar", "acao"] as const).map((s) => {
          const b = saude[s];
          const ativo = foco === s;
          const dotColor = s === "dentro" ? (variante === "tatica" ? "bg-slate-400" : "bg-emerald-500") : s === "acompanhar" ? "bg-amber-500" : "bg-red-500";
          return (
            <button
              key={s}
              onClick={() => {
                if (foco === s) { setFoco("todos"); setModalFoco(null); }
                else { setFoco(s); setModalFoco(s); setModalOpen(true); }
              }}
              aria-pressed={ativo}
              className={`w-full rounded-md border border-border-subtle bg-card-alt px-2.5 py-1.5 flex items-center justify-between text-[11px] ${ativo ? "ring-2 ring-accent" : ""} hover:bg-card transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
            >
              <span className="flex items-center gap-2 font-semibold text-text">
                <span className={`h-2 w-2 rounded-full ${dotColor}`} aria-hidden="true" />
                {rotulos[s]}
              </span>
              <span className="flex items-center gap-2 text-text-muted">
                <span>{b.n} proj.</span>
                <span className="font-bold">{formatCurrencyMillions(b.valor)}</span>
              </span>
            </button>
          );
        })}
        {mostrarSemOrcamento && (
          <button
            onClick={() => {
              if (foco === "semOrcamento") { setFoco("todos"); setModalFoco(null); }
              else { setFoco("semOrcamento"); setModalFoco("semOrcamento"); setModalOpen(true); }
            }}
            aria-pressed={foco === "semOrcamento"}
            className={`w-full rounded-md border border-border-subtle bg-card-alt px-2.5 py-1.5 flex items-center justify-between text-[11px] ${foco === "semOrcamento" ? "ring-2 ring-accent" : ""} hover:bg-card transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
          >
            <span className="flex items-center gap-2 font-semibold text-text-muted">
              <span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden="true" />
              {LABELS.semOrcamento26}
            </span>
            <span className="text-text-muted">{semOrcamento.length} proj.</span>
          </button>
        )}
      </section>

      {!somenteStatus && (
      <section className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Principal Alerta</p>
        {principalAlerta.tipo === "alert" ? (
          <div className="rounded-md border border-red-400/40 bg-red-500/10 px-2.5 py-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
              <AlertTriangle size={14} aria-hidden="true" />
              {principalAlerta.titulo}
            </p>
          </div>
        ) : (
          <div className={`rounded-md border px-2.5 py-2 ${variante === "tatica" ? "border-slate-400/40 bg-slate-500/10" : "border-emerald-400/40 bg-emerald-500/10"}`}>
            <p className={`flex items-center gap-2 text-sm font-semibold ${variante === "tatica" ? "text-slate-700 dark:text-slate-300" : "text-emerald-700 dark:text-emerald-300"}`}>
              <CheckCircle2 size={14} aria-hidden="true" />
              Nenhum alerta ativo
            </p>
          </div>
        )}
      </section>
      )}

      {!somenteStatus && (
      <section className="space-y-1 min-h-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Top Ofensores</p>
        <div className="grid grid-cols-1 gap-1.5">
          <button
            onClick={() => {
              if (foco === "faltantes") { setFoco("todos"); setModalFoco(null); }
              else { setFoco("faltantes"); setModalFoco("faltantes"); setModalOpen(true); }
            }}
            aria-pressed={foco === "faltantes"}
            className={`rounded-lg bg-card-alt px-2.5 py-1.5 text-left transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              foco === "faltantes" ? "ring-2 ring-accent" : ""
            }`}
          >
            <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">Emissões Faltantes</p>
            {isLoadingCompromisso ? (
              <>
                <SkeletonBlock className="h-6 w-14 mt-2" />
                <SkeletonBlock className="h-3 w-28 mt-2" />
              </>
            ) : (
              <div className="mt-1 flex items-center justify-between gap-2.5">
                <span className="text-2xl font-extrabold text-text">{risco.emissoesFaltantes.n}</span>
                <span className="text-xs font-semibold text-text-muted">{formatCurrencyMillions(risco.emissoesFaltantes.valor)}</span>
              </div>
            )}
          </button>

          <button
            onClick={() => {
              if (foco === "excedentes") { setFoco("todos"); setModalFoco(null); }
              else { setFoco("excedentes"); setModalFoco("excedentes"); setModalOpen(true); }
            }}
            aria-pressed={foco === "excedentes"}
            className={`rounded-lg bg-card-alt px-2.5 py-1.5 text-left transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              foco === "excedentes" ? "ring-2 ring-accent" : ""
            }`}
          >
            <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">Emissões Excedentes</p>
            {isLoadingCompromisso ? (
              <>
                <SkeletonBlock className="h-6 w-14 mt-2" />
                <SkeletonBlock className="h-3 w-28 mt-2" />
              </>
            ) : (
              <div className="mt-1 flex items-center justify-between gap-2.5">
                <span className="text-2xl font-extrabold text-text">{risco.emissoesExcedentes.n}</span>
                <span className="text-xs font-semibold text-text-muted">{formatCurrencyMillions(Math.abs(risco.emissoesExcedentes.valor))}</span>
              </div>
            )}
          </button>
        </div>
      </section>
      )}

      <ProjectListModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setFoco("todos"); setModalFoco(null); }}
        title={modalTitle}
        projetos={listaModalFoco}
        valorFn={modalValorFn}
        justificativaFn={modalJustificativaFn}
        onSelectProject={onSelectProject}
      />
    </aside>
  );
}
