import { useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { Card, KpiCard } from "../../components/ui/primitives";
import { Select } from "../../components/ui/select";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { fmtBRL, fmtNumber } from "../../lib/format";
import { navigate } from "../../lib/simpleRouter";
import { usePortfolioData } from "../../hooks/usePortfolioData";
import { pagamentoNoRecorte, projetoNoRecorteComRubrica, rcNoRecorte, rubricasDoRecorte, type Recorte } from "../../lib/recorte";
import { useRecorteStore } from "../../store/recorteStore";
import { CommitmentTable } from "./CommitmentTable";
import { OperationalTable } from "./OperationalTable";
import { useCuration } from "./useCuration";
import { precisaAtencao } from "./RcRow";
import { poStatusLabel } from "./status";
import { RADAR_CARD_BUCKETS, type CashBucket } from "./types";

function formatGeradoEm(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
}

export function RadarPage({ initialTab = "operacional" }: { initialTab?: "curadoria" | "operacional" } = {}) {
  const { isLoading, error, bundle, views, rcViews, resumo, isSaving, erroDe, salvarChave, salvarRc, curationMap } = useCuration();
  const { parsed } = usePortfolioData();
  const programa = useRecorteStore((s) => s.programa);
  const rubricas = useRecorteStore((s) => s.rubricas);
  const gestor = useRecorteStore((s) => s.gestor);
  const aprovador = useRecorteStore((s) => s.aprovador);
  const busca = useRecorteStore((s) => s.busca);
  const setPrograma = useRecorteStore((s) => s.setPrograma);
  const setRubricas = useRecorteStore((s) => s.setRubricas);
  const setGestor = useRecorteStore((s) => s.setGestor);
  const setAprovador = useRecorteStore((s) => s.setAprovador);
  const setBusca = useRecorteStore((s) => s.setBusca);
  const limpar = useRecorteStore((s) => s.limpar);
  const [activeTab, setActiveTab] = useState<"curadoria" | "operacional">(initialTab);

  // Programa e plataforma são o mesmo campo (n4Curta): a tela usa o campo único `programa` do recorte
  const recorte = useMemo<Recorte>(
    () => ({ programa, rubricas, gestor, aprovador, busca }),
    [programa, rubricas, gestor, aprovador, busca]
  );
  const exerciseYear = bundle?.exerciseYear ?? new Date().getFullYear();
  const filtrosAtivos = (programa ? 1 : 0) + (gestor ? 1 : 0) + (aprovador ? 1 : 0) + rubricas.length + (busca.trim() ? 1 : 0);

  const projetoPorNome = useMemo(() => new Map((parsed?.projetos ?? []).map((p) => [p.nome, p])), [parsed]);

  const opcoesFiltro = useMemo(() => {
    const projetos = views.map((v) => projetoPorNome.get(v.projectName)).filter(Boolean);
    const opcoes = (valores: Array<string | null>) => Array.from(new Set(valores.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "pt-BR")).map((value) => ({ value, label: value }));
    return {
      plataformas: opcoes(projetos.map((p) => p?.n4Curta ?? null)),
      gestores: opcoes(projetos.map((p) => p?.gestor ?? null)),
      aprovadores: opcoes(projetos.map((p) => p?.aprovador ?? null)),
      rubricas: rubricasDoRecorte(parsed?.projetos ?? [], rcViews, bundle?.payments?.inPayment ?? []).map((r) => ({ value: r, label: r })),
    };
  }, [projetoPorNome, views, rcViews, bundle, parsed]);

  const rcViewsFiltradas = useMemo(
    () => rcViews.filter((rc) => rcNoRecorte(rc, recorte, projetoPorNome, exerciseYear)),
    [rcViews, recorte, projetoPorNome, exerciseYear]
  );

  const rcsPendentes = useMemo(() => rcViewsFiltradas.filter(precisaAtencao).length, [rcViewsFiltradas]);

  // Os KPIs do topo somam os baldes das RCs que passam no recorte (cada RC mantém o valor total)
  const somaBalde = (balde: CashBucket) => rcViewsFiltradas.reduce((acc, rc) => acc + rc.buckets[balde], 0);

  const rcsFiltradas = useMemo(() => new Set(rcViewsFiltradas.map((rc) => rc.rc)), [rcViewsFiltradas]);

  // O A emitir e o delta caixa da aba Operacional usam o BG dos projetos que passam no recorte
  const projetosFiltrados = useMemo(
    () => (parsed?.projetos ?? []).filter((p) => projetoNoRecorteComRubrica(p, recorte)),
    [parsed, recorte]
  );

  // RCs em pagamento (NF lançada): a maioria já não tem compromisso aberto, então a RC entra se alguma linha de pagamento passa no recorte
  const rcsPagamentoFiltradas = useMemo(() => {
    const porRc = new Set<string>();
    for (const p of bundle?.payments?.inPayment ?? []) {
      if (p.withoutRc || !p.rc) continue;
      if (pagamentoNoRecorte(p, recorte, projetoPorNome)) porRc.add(p.rc);
    }
    return porRc;
  }, [bundle, recorte, projetoPorNome]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text"
          >
            <ArrowLeft size={15} /> Voltar
          </button>
          <h1 className="text-lg font-bold text-text">{activeTab === "curadoria" ? "Curadoria de Dados" : "Classificação Risco Empenho"}</h1>
        </div>
        {bundle && <div className="text-[11px] text-text-faint">Dados BI: {formatGeradoEm(bundle.generatedAt)}</div>}
      </div>

      {isLoading && <SkeletonList rows={8} />}

      {!isLoading && error && (
        <Card className="border-risk-critico">
          <div className="text-sm font-semibold text-risk-critico">Não foi possível carregar o Radar</div>
          <div className="text-xs text-text-muted mt-1">{error}</div>
        </Card>
      )}

      {!isLoading && !error && resumo && (
        <>
          {!resumo.reconciles ? (
            <Card className="border-risk-critico">
              <div className="text-sm font-semibold text-risk-critico">
                Os baldes de caixa não batem com o total do BI — os KPIs foram ocultados até a inconsistência ser corrigida na origem.
              </div>
            </Card>
          ) : (
            <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 ${activeTab === "curadoria" ? "" : "hidden"}`}>
              <KpiCard
                label={poStatusLabel("CONFIRMED", resumo.exerciseYear)}
                value={fmtBRL(somaBalde(RADAR_CARD_BUCKETS.bgTimes), true)}
                sub="curadoria do exercício"
              />
              <KpiCard
                label={poStatusLabel("CARRYOVER", resumo.exerciseYear)}
                value={fmtBRL(somaBalde(RADAR_CARD_BUCKETS.carryover), true)}
                sub="pagamento previsto após o exercício"
              />
              <KpiCard
                label="Sem avaliação"
                value={fmtBRL(somaBalde(RADAR_CARD_BUCKETS.notCurated), true)}
                sub={`${fmtNumber(rcsPendentes)} RC${rcsPendentes === 1 ? "" : "s"} pendente${rcsPendentes === 1 ? "" : "s"}`}
              />
            </div>
          )}

          <Card className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[220px] flex-1">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden="true" />
                <span className="sr-only">Buscar na tabela</span>
                <input
                  type="search"
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="Buscar RC, fornecedor, projeto, OC ou status"
                  className="w-full rounded border border-border bg-card py-2 pl-8 pr-3 text-xs text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                />
              </label>
              <div className="relative group/rubricas">
                <button
                  className="inline-flex items-center justify-between gap-2 rounded-md border border-border bg-card-alt px-3 py-1.5 text-xs text-text min-w-[150px] hover:border-accent transition-colors"
                >
                  {rubricas.length === 0 ? "Todas rubricas" : `Rubricas (${rubricas.length})`}
                  <span className="text-text-muted">▾</span>
                </button>
                <div className="absolute top-full left-0 mt-1 z-50 w-64 p-3 rounded-card border border-border bg-card shadow-lg flex flex-col gap-1 max-h-64 overflow-y-auto hidden group-focus-within/rubricas:flex group-hover/rubricas:flex custom-scrollbar">
                  {opcoesFiltro.rubricas.map(r => (
                    <label key={r.value} className="flex items-center gap-2 text-xs cursor-pointer text-text hover:bg-bg p-1 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={rubricas.includes(r.value)}
                        onChange={(e) => {
                          if (e.target.checked) setRubricas([...rubricas, r.value]);
                          else setRubricas(rubricas.filter(x => x !== r.value));
                        }}
                        className="rounded border-border text-accent focus:ring-accent w-3 h-3"
                      />
                      <span className="truncate">{r.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Select value={programa} onValueChange={setPrograma} options={opcoesFiltro.plataformas} placeholder="Plataforma" />
              <Select value={gestor} onValueChange={setGestor} options={opcoesFiltro.gestores} placeholder="Gestor" />
              <Select value={aprovador} onValueChange={setAprovador} options={opcoesFiltro.aprovadores} placeholder="1º Aprovador" />
              {filtrosAtivos > 0 && (
                <button
                  type="button"
                  onClick={limpar}
                  className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text hover:border-accent transition-colors"
                >
                  Limpar ({filtrosAtivos})
                </button>
              )}
            </div>
          </Card>

          <div className="flex gap-4 border-b border-border">
            <button
              className={`pb-2 text-sm font-medium transition-colors ${activeTab === "curadoria" ? "border-b-2 border-accent text-accent" : "text-text-muted hover:text-text"}`}
              onClick={() => setActiveTab("curadoria")}
            >
              Curadoria
            </button>
            <button
              className={`pb-2 text-sm font-medium transition-colors ${activeTab === "operacional" ? "border-b-2 border-accent text-accent" : "text-text-muted hover:text-text"}`}
              onClick={() => setActiveTab("operacional")}
            >
              Operacional (beta)
            </button>
          </div>

          {activeTab === "curadoria" ? (
            <CommitmentTable
              rcViews={rcViewsFiltradas}
              exerciseYear={resumo.exerciseYear}
              isSaving={isSaving}
              erroDe={erroDe}
              onSalvarRc={salvarRc}
              onSalvarChave={salvarChave}
            />
          ) : (
            <OperationalTable
              bundle={bundle!}
              curationMap={curationMap}
              referenceDateStr={bundle!.generatedAt}
              allowedRcs={rcsFiltradas}
              allowedPaymentRcs={rcsPagamentoFiltradas}
              salvarRc={salvarRc}
              erroDe={erroDe}
              lista={projetosFiltrados}
            />
          )}
        </>
      )}
    </div>
  );
}
