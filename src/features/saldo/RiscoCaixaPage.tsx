import { useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { navigate } from "../../lib/simpleRouter";
import { fmtBRL } from "../../lib/format";
import { cn } from "../../lib/utils";
import { usePortfolioData } from "../../hooks/usePortfolioData";
import { projetoNoRecorte, rubricasDoRecorte, type Recorte } from "../../lib/recorte";
import { useRecorteStore } from "../../store/recorteStore";
import { useCuration } from "../radar/useCuration";
import { useSaldoProjetos } from "./useSaldoProjetos";
import { Button, Card } from "../../components/ui/primitives";
import { RecorteAtivo } from "../../components/RecorteAtivo";
import { Select } from "../../components/ui/select";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { Collapsible } from "../executivo/Collapsible";
import { buildNarrativaRisco } from "../executivo/narrativa";
import { SaldoBridge } from "./SaldoBridge";
import { ProjetoSaldoTable } from "./ProjetoSaldoTable";
import { SaldoAuditPanel } from "./SaldoAuditPanel";
import { RiscoKpis } from "./RiscoKpis";
import { RiscoKpisPlurianual } from "./RiscoKpisPlurianual";
import { buildNarrativaPlurianual, buildPlurianualViews, resumoPlurianual, rubricasPlurianuaisDoProjeto } from "./plurianual";
import { RubricaChips } from "./RubricaChips";
import { OndeAgirList, type MetaProjeto } from "./OndeAgirList";
import { aggregateSaldoBy, filterSaldoLinhas, saldoTotalDe, splitPressaoFolga, summarizeSaldo, ultimaDataParadaPorProjeto } from "./saldo";
import type { SaldoProjetoLinha, SaldoProjetosSection, SaldoRecorteView, SaldoTotals } from "../radar/types";

function AuditoriaPlurianual({ totals }: { totals: SaldoTotals }) {
  const itens: Array<[string, string]> = [
    ["Σ orçamento plurianual", fmtBRL(totals.orcamento)],
    ["Σ caixa 2026+2027", fmtBRL(totals.caixa)],
    ["Σ compromisso total", fmtBRL(totals.compromissoTotal)],
    ["Nº de projetos", String(totals.projetos)],
  ];
  return (
    <Card>
      <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        {itens.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{rotulo}</dt>
            <dd className="tabular-nums text-text">{valor}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-text-muted">A reconciliação com o BI fica na visão 2026.</p>
    </Card>
  );
}

function formatarDataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function RiscoCaixaPage() {
  const state = useSaldoProjetos();
  const { parsed } = usePortfolioData();
  const { bundle, rcViews } = useCuration();

  const programa = useRecorteStore((s) => s.programa);
  const rubricas = useRecorteStore((s) => s.rubricas);
  const aprovador = useRecorteStore((s) => s.aprovador);
  const busca = useRecorteStore((s) => s.busca);
  const setPrograma = useRecorteStore((s) => s.setPrograma);
  const setRubricas = useRecorteStore((s) => s.setRubricas);
  const setAprovador = useRecorteStore((s) => s.setAprovador);
  const setBusca = useRecorteStore((s) => s.setBusca);
  const limpar = useRecorteStore((s) => s.limpar);
  const [todosAberto, setTodosAberto] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [modo, setModo] = useState<"plurianual" | "2026">("plurianual");
  const todosRef = useRef<HTMLDivElement>(null);

  const section: SaldoProjetosSection | null = state.status === "ready" ? state.section : null;
  const projetos = useMemo(() => parsed?.projetos ?? [], [parsed]);

  const meta = useMemo(() => {
    const m = new Map<string, { n4Curta: string }>();
    for (const p of projetos) m.set(p.id, { n4Curta: p.n4Curta });
    return m;
  }, [projetos]);

  const linhasBase = useMemo<SaldoProjetoLinha[]>(() => section?.linhas ?? [], [section]);

  const programaOptions = useMemo(() => {
    const nomes = new Set<string>();
    for (const l of linhasBase) {
      const n4 = meta.get(l.projectKey)?.n4Curta;
      if (n4) nomes.add(n4);
    }
    return Array.from(nomes)
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .map((n) => ({ value: n, label: n }));
  }, [linhasBase, meta]);

  const rubricaOptions = useMemo(
    () =>
      rubricasDoRecorte(parsed?.projetos ?? [], rcViews, bundle?.payments?.inPayment ?? []).map((r) => ({ value: r, label: r })),
    [parsed, rcViews, bundle],
  );

  const aprovadorOptions = useMemo(
    () =>
      Array.from(new Set(linhasBase.map((l) => l.aprovador).filter((a): a is string => !!a)))
        .sort((a, b) => a.localeCompare(b, "pt-BR"))
        .map((a) => ({ value: a, label: a })),
    [linhasBase],
  );

  const recorte = useMemo<Recorte>(
    () => ({ programa, rubricas, gestor: null, aprovador, busca }),
    [programa, rubricas, aprovador, busca],
  );

  // Projetos do recorte (sem rubrica: a rubrica filtra só as linhas de saldo, via filterSaldoLinhas)
  const projectKeys = useMemo<ReadonlySet<string> | undefined>(() => {
    if (!programa && !aprovador) return undefined;
    const keys = new Set<string>();
    for (const p of projetos) if (projetoNoRecorte(p, recorte)) keys.add(p.id);
    return keys;
  }, [programa, aprovador, projetos, recorte]);

  const rubricasFiltro = rubricas.length > 0 ? rubricas : undefined;

  const linhas = useMemo(
    () =>
      filterSaldoLinhas(linhasBase, {
        projectKeys,
        rubricas: rubricasFiltro,
        aprovador: aprovador ?? undefined,
        busca,
      }),
    [linhasBase, projectKeys, rubricasFiltro, aprovador, busca],
  );

  const totals = useMemo(() => summarizeSaldo(linhas), [linhas]);
  const viewsRubrica = useMemo(() => aggregateSaldoBy(linhas, "rubrica"), [linhas]);
  const viewsProjeto = useMemo(() => aggregateSaldoBy(linhas, "projeto"), [linhas]);

  const linhasSemRubrica = useMemo(
    () => filterSaldoLinhas(linhasBase, { projectKeys, aprovador: aprovador ?? undefined, busca }),
    [linhasBase, projectKeys, aprovador, busca],
  );
  const viewsRubricaChips = useMemo(() => aggregateSaldoBy(linhasSemRubrica, "rubrica"), [linhasSemRubrica]);
  const pf = useMemo(() => splitPressaoFolga(viewsProjeto, viewsRubrica), [viewsProjeto, viewsRubrica]);
  const filtrosAtivos = (programa ? 1 : 0) + rubricas.length + (aprovador ? 1 : 0) + (busca.trim() !== "" ? 1 : 0);
  const tituloMaisFiltros =
    filtrosAtivos > 0 ? `Mais filtros (${filtrosAtivos} ativo${filtrosAtivos > 1 ? "s" : ""})` : "Mais filtros";

  const ultimaParada = useMemo(() => ultimaDataParadaPorProjeto(linhas), [linhas]);
  const metaParado = useMemo(() => {
    const m = new Map<string, MetaProjeto>();
    for (const [key, p] of meta) m.set(key, { ...p, ultimaDataParada: ultimaParada.get(key) ?? null });
    return m;
  }, [meta, ultimaParada]);

  function abrirTodosProjetos() {
    setTodosAberto(true);
    requestAnimationFrame(() => todosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const linhasPorProjeto = useMemo(() => {
    const m = new Map<string, SaldoProjetoLinha[]>();
    for (const l of linhas) {
      const arr = m.get(l.projectKey);
      if (arr) arr.push(l);
      else m.set(l.projectKey, [l]);
    }
    return m;
  }, [linhas]);

  // Plurianual: projetos da carteira, sem filtro de rubrica (a rubrica só filtra as views de saldo)
  const projetosPlurianual = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return projetos.filter(
      (p) =>
        projetoNoRecorte(p, { ...recorte, rubricas: [] }) &&
        (!termo || p.nome.toLocaleLowerCase("pt-BR").includes(termo)),
    );
  }, [projetos, recorte, busca]);

  const plurianual = useMemo(
    () => buildPlurianualViews(projetosPlurianual, { rubricas, saldoBI: [...viewsProjeto, ...viewsRubrica] }),
    [projetosPlurianual, rubricas, viewsProjeto, viewsRubrica],
  );
  const resumoPl = useMemo(() => resumoPlurianual(plurianual.porProjeto), [plurianual]);
  const narrativaPl = useMemo(() => buildNarrativaPlurianual(resumoPl), [resumoPl]);
  const rubricasPlurianuaisPorProjeto = useMemo(() => {
    const exibidos = new Set(plurianual.porProjeto.map((v) => v.key));
    const mapa = new Map<string, SaldoRecorteView[]>();
    for (const p of projetosPlurianual) {
      if (exibidos.has(p.id)) mapa.set(p.id, rubricasPlurianuaisDoProjeto(p, rubricas));
    }
    return mapa;
  }, [plurianual, projetosPlurianual, rubricas]);

  const temFiltro = filtrosAtivos > 0;

  function alternarRubrica(r: string) {
    setRubricas(rubricas.includes(r) ? rubricas.filter((x) => x !== r) : [...rubricas, r]);
  }

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" onClick={() => navigate("/")} className="inline-flex items-center gap-1 px-2 py-1 text-sm">
            <ArrowLeft size={16} aria-hidden="true" />
            Voltar
          </Button>
          <h1 className="text-xl font-semibold text-text">Risco de Caixa &amp; Rubricas</h1>
          <div className="flex items-center gap-2">
            {(["plurianual", "2026"] as const).map((op) => (
              <button
                key={op}
                type="button"
                aria-pressed={modo === op}
                onClick={() => setModo(op)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                  modo === op ? "bg-accent text-white" : "bg-card-alt text-text-muted hover:text-text",
                )}
              >
                {op === "plurianual" ? "Plurianual" : "2026"}
              </button>
            ))}
          </div>
          {modo === "plurianual" ? (
            <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-text-muted">
              Fonte: carteira (orçamento plurianual)
            </span>
          ) : section && (
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                section.reconciliation.ok
                  ? "border-risk-baixo text-risk-baixo"
                  : "border-risk-critico text-risk-critico"
              }`}
            >
              {section.reconciliation.ok ? "Reconciliado" : "Não reconciliado"}
            </span>
          )}
        </div>
        {modo === "plurianual" ? (
          <p className="text-sm text-text-muted">Orçamento plurianual</p>
        ) : section && (
          <p className="text-sm text-text-muted">
            Exercício {section.exerciseYear} · referência BI {formatarDataBR(section.dataReferencia)}
          </p>
        )}
      </div>
    </div>
  );

  let corpo: ReactNode;

  if (state.status === "loading") {
    corpo = <SkeletonList rows={8} />;
  } else if (state.status === "unavailable") {
    corpo = (
      <Card>
        <p className="text-sm text-text-muted">
          O saldo de projetos ainda não foi publicado. Assim que a fonte for gerada, esta página será atualizada.
        </p>
      </Card>
    );
  } else if (state.status === "error") {
    corpo = (
      <Card className="border-risk-critico">
        <p className="text-sm text-risk-critico">Não foi possível carregar o saldo de projetos: {state.message}</p>
      </Card>
    );
  } else {
    const ok = state.section.reconciliation.ok;
    const exercicio = state.section.exerciseYear;

    const blocoPlurianual =
      projetosPlurianual.length === 0 ? (
        <Card>
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-text-muted">Nenhum projeto corresponde aos filtros selecionados.</p>
            <Button variant="outline" onClick={limpar} disabled={!temFiltro}>
              Limpar filtros
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4">
            <p className="text-lg text-text">{narrativaPl}</p>
            <RiscoKpisPlurianual resumo={resumoPl} />
          </div>

          <RubricaChips views={plurianual.porRubrica} selected={rubricas} onToggle={alternarRubrica} />

          <OndeAgirList
            modo="plurianual"
            porProjeto={plurianual.porProjeto}
            meta={metaParado}
            dataReferencia={state.section.dataReferencia}
            exerciseYear={exercicio}
            onVerTodos={abrirTodosProjetos}
          />

          <Collapsible title="Como chegamos nesse número">
            <SaldoBridge modo="plurianual" totals={plurianual.totals} exerciseYear={exercicio} />
          </Collapsible>

          <div ref={todosRef}>
            <Collapsible title="Todos os projetos" open={todosAberto} onOpenChange={setTodosAberto}>
              <ProjetoSaldoTable
                views={plurianual.porProjeto}
                rubricasPorProjeto={rubricasPlurianuaisPorProjeto}
                meta={meta}
                dataReferencia={state.section.dataReferencia}
                exerciseYear={exercicio}
              />
            </Collapsible>
          </div>

          <Collapsible title="Auditoria">
            <AuditoriaPlurianual totals={plurianual.totals} />
          </Collapsible>
        </div>
      );

    corpo = (
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-text-muted">
                Programa
                <Select value={programa} onValueChange={setPrograma} options={programaOptions} placeholder="Todos os programas" />
              </label>
              <button
                type="button"
                aria-expanded={filtrosAbertos}
                aria-controls="filtros-secundarios"
                onClick={() => setFiltrosAbertos((v) => !v)}
                className="flex h-9 w-full items-center gap-2 rounded-md border border-border bg-card px-3 text-left text-sm font-semibold text-text transition-colors hover:bg-card-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                {filtrosAbertos ? (
                  <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-text-muted" />
                ) : (
                  <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-text-muted" />
                )}
                {tituloMaisFiltros}
              </button>
            </div>
            {filtrosAbertos && (
              <div id="filtros-secundarios" className="flex flex-col gap-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <label className="flex flex-col gap-1 text-xs text-text-muted">
                    Rubricas
                    <Select
                      value={null}
                      onValueChange={(v) => {
                        if (v) alternarRubrica(v);
                      }}
                      options={rubricaOptions}
                      placeholder={rubricas.length > 0 ? `${rubricas.length} selecionada(s)` : "Todas as rubricas"}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-muted">
                    Aprovador
                    <Select value={aprovador} onValueChange={setAprovador} options={aprovadorOptions} placeholder="Todos os aprovadores" />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-muted">
                    Busca
                    <input
                      type="search"
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      placeholder="Projeto, LB ou rubrica"
                      className="rounded-md border border-border bg-card px-3 py-2 text-sm text-text placeholder:text-text-faint"
                    />
                  </label>
                </div>
                {rubricas.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {rubricas.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => alternarRubrica(r)}
                        aria-label={`Remover rubrica ${r}`}
                        className="rounded-full border border-border px-2 py-0.5 text-text hover:bg-card-alt"
                      >
                        {r} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        <RecorteAtivo />

        {modo === "plurianual" ? blocoPlurianual : (<>
        {!ok ? (
          <Card>
            <div className="text-sm text-risk-critico">
              Saldo potencial oculto: a conciliação com a carteira não confere.
            </div>
          </Card>
        ) : linhas.length === 0 ? (
          <Card>
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-text-muted">Nenhum projeto corresponde aos filtros selecionados.</p>
              <Button variant="outline" onClick={limpar} disabled={!temFiltro}>
                Limpar filtros
              </Button>
            </div>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-lg text-text">{buildNarrativaRisco(pf)}</p>
            <RiscoKpis pf={pf} saldoLiquido={saldoTotalDe(totals)} />
          </div>
        )}

        <RubricaChips views={viewsRubricaChips} selected={rubricas} onToggle={alternarRubrica} />

        <OndeAgirList
          porProjeto={viewsProjeto}
          meta={metaParado}
          dataReferencia={state.section.dataReferencia}
          exerciseYear={state.section.exerciseYear}
          onVerTodos={abrirTodosProjetos}
        />

        <Collapsible title="Como chegamos nesse número">
          <SaldoBridge totals={totals} exerciseYear={state.section.exerciseYear} hidden={!ok} incluirLegado />
        </Collapsible>

        <div ref={todosRef}>
          <Collapsible title="Todos os projetos" open={todosAberto} onOpenChange={setTodosAberto}>
            {linhas.length === 0 ? null : (
              <ProjetoSaldoTable
                views={viewsProjeto}
                linhasPorProjeto={linhasPorProjeto}
                meta={meta}
                dataReferencia={state.section.dataReferencia}
                exerciseYear={state.section.exerciseYear}
              />
            )}
          </Collapsible>
        </div>

        <Collapsible title="Auditoria">
          <SaldoAuditPanel section={state.section} projetos={projetos} />
        </Collapsible>
        </>)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {header}
      {corpo}
    </div>
  );
}
