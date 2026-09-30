import { useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { Card, KpiCard } from "../../components/ui/primitives";
import { Select } from "../../components/ui/select";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { fmtBRL, fmtNumber } from "../../lib/format";
import { navigate } from "../../lib/simpleRouter";
import { usePortfolioData } from "../../hooks/usePortfolioData";
import { aplicarFiltroRubrica } from "../../lib/rubrica";
import { CommitmentTable } from "./CommitmentTable";
import { OperationalTable } from "./OperationalTable";
import { useCuration } from "./useCuration";
import { precisaAtencao } from "./RcRow";
import { poStatusLabel } from "./status";
import { RADAR_CARD_BUCKETS } from "./types";

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
  const [plataformaFiltro, setPlataformaFiltro] = useState<string | null>(null);
  const [gestorFiltro, setGestorFiltro] = useState<string | null>(null);
  const [aprovadorFiltro, setAprovadorFiltro] = useState<string | null>(null);
  const [rubricaFiltro, setRubricaFiltro] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [activeTab, setActiveTab] = useState<"curadoria" | "operacional">(initialTab);

  const projetoPorNome = useMemo(() => new Map((parsed?.projetos ?? []).map((p) => [p.nome, p])), [parsed]);

  const opcoesFiltro = useMemo(() => {
    const projetos = views.map((v) => projetoPorNome.get(v.projectName)).filter(Boolean);
    const opcoes = (valores: Array<string | null>) => Array.from(new Set(valores.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "pt-BR")).map((value) => ({ value, label: value }));
    const rubricasSet = new Set<string>();
    for (const v of rcViews) {
      for (const c of v.commitments) {
        if (c.rubrica) rubricasSet.add(c.rubrica);
      }
    }
    for (const p of bundle?.payments?.inPayment ?? []) {
      if (p.rubrica) rubricasSet.add(p.rubrica);
    }
    return {
      plataformas: opcoes(projetos.map((p) => p?.n4Curta ?? null)),
      gestores: opcoes(projetos.map((p) => p?.gestor ?? null)),
      aprovadores: opcoes(projetos.map((p) => p?.aprovador ?? null)),
      rubricas: Array.from(rubricasSet).sort().map(r => ({ value: r, label: r })),
    };
  }, [projetoPorNome, views, rcViews, bundle]);

  const rcsPendentes = useMemo(() => rcViews.filter(precisaAtencao).length, [rcViews]);

  const rcViewsFiltradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return rcViews.filter((rc) => {
      const projetos = rc.commitments.map((c) => projetoPorNome.get(c.projectName)).filter(Boolean);
      if (plataformaFiltro && !projetos.some((p) => p?.n4Curta === plataformaFiltro)) return false;
      if (gestorFiltro && !projetos.some((p) => p?.gestor === gestorFiltro)) return false;
      if (aprovadorFiltro && !projetos.some((p) => p?.aprovador === aprovadorFiltro)) return false;
      if (rubricaFiltro.length > 0 && !rc.commitments.some(c => rubricaFiltro.includes(c.rubrica))) return false;
      if (termo) {
        const textos = rc.commitments.flatMap((commitment) => [
          rc.rc,
          commitment.oc,
          commitment.projectId,
          commitment.projectName,
          commitment.supplier || commitment.projectName,
          commitment.curation?.poStatus ?? "",
          commitment.curation ? poStatusLabel(commitment.curation.poStatus, bundle?.exerciseYear ?? new Date().getFullYear()) : "",
          commitment.systemStatus,
          commitment.requestDescription ?? "",
          commitment.curation?.notes ?? "",
        ]);
        if (!textos.some((texto) => texto.toLocaleLowerCase("pt-BR").includes(termo))) return false;
      }
      return true;
    });
  }, [rcViews, projetoPorNome, plataformaFiltro, gestorFiltro, aprovadorFiltro, busca, bundle?.exerciseYear]);

  const rcsFiltradas = useMemo(() => new Set(rcViewsFiltradas.map((rc) => rc.rc)), [rcViewsFiltradas]);

  // Projetos com os mesmos filtros de plataforma/gestor/aprovador: o A emitir e o delta caixa da aba Operacional usam o BG deles
  const projetosFiltrados = useMemo(() => {
    let base = (parsed?.projetos ?? []).filter((p) =>
      (!plataformaFiltro || p.n4Curta === plataformaFiltro) &&
      (!gestorFiltro || p.gestor === gestorFiltro) &&
      (!aprovadorFiltro || p.aprovador === aprovadorFiltro)
    );
    base = aplicarFiltroRubrica(base, rubricaFiltro);
    return base;
  }, [parsed, plataformaFiltro, gestorFiltro, aprovadorFiltro, rubricaFiltro]);

  // RCs em pagamento (NF lançada): a maioria já não tem compromisso aberto, então filtra pelos dados do pagamento
  const rcsPagamentoFiltradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    const porRc = new Map<string, boolean>();
    for (const p of bundle?.payments?.inPayment ?? []) {
      if (p.withoutRc || !p.rc) continue;
      const projeto = projetoPorNome.get(p.projectName ?? "");
      let ok = true;
      if (plataformaFiltro && projeto?.n4Curta !== plataformaFiltro) ok = false;
      if (gestorFiltro && projeto?.gestor !== gestorFiltro) ok = false;
      if (aprovadorFiltro && projeto?.aprovador !== aprovadorFiltro && p.approver !== aprovadorFiltro) ok = false;
      if (rubricaFiltro.length > 0 && (!p.rubrica || !rubricaFiltro.includes(p.rubrica))) ok = false;
      if (termo && ![p.rc, p.nf, p.projectName].some((t) => (t ?? "").toLocaleLowerCase("pt-BR").includes(termo))) ok = false;
      porRc.set(p.rc, (porRc.get(p.rc) ?? false) || ok);
    }
    return new Set([...porRc].filter(([, ok]) => ok).map(([rc]) => rc));
  }, [bundle, projetoPorNome, plataformaFiltro, gestorFiltro, aprovadorFiltro, busca]);

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
                value={fmtBRL(resumo.buckets[RADAR_CARD_BUCKETS.bgTimes], true)}
                sub="curadoria do exercício"
              />
              <KpiCard
                label={poStatusLabel("CARRYOVER", resumo.exerciseYear)}
                value={fmtBRL(resumo.buckets[RADAR_CARD_BUCKETS.carryover], true)}
                sub="pagamento previsto após o exercício"
              />
              <KpiCard
                label="Sem avaliação"
                value={fmtBRL(resumo.buckets[RADAR_CARD_BUCKETS.notCurated], true)}
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
                  {rubricaFiltro.length === 0 ? "Todas rubricas" : `Rubricas (${rubricaFiltro.length})`}
                  <span className="text-text-muted">▾</span>
                </button>
                <div className="absolute top-full left-0 mt-1 z-50 w-64 p-3 rounded-card border border-border bg-card shadow-lg flex flex-col gap-1 max-h-64 overflow-y-auto hidden group-focus-within/rubricas:flex group-hover/rubricas:flex custom-scrollbar">
                  {opcoesFiltro.rubricas.map(r => (
                    <label key={r.value} className="flex items-center gap-2 text-xs cursor-pointer text-text hover:bg-bg p-1 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={rubricaFiltro.includes(r.value)}
                        onChange={(e) => {
                          if (e.target.checked) setRubricaFiltro([...rubricaFiltro, r.value]);
                          else setRubricaFiltro(rubricaFiltro.filter(x => x !== r.value));
                        }}
                        className="rounded border-border text-accent focus:ring-accent w-3 h-3"
                      />
                      <span className="truncate">{r.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Select value={plataformaFiltro} onValueChange={setPlataformaFiltro} options={opcoesFiltro.plataformas} placeholder="Plataforma" />
              <Select value={gestorFiltro} onValueChange={setGestorFiltro} options={opcoesFiltro.gestores} placeholder="Gestor" />
              <Select value={aprovadorFiltro} onValueChange={setAprovadorFiltro} options={opcoesFiltro.aprovadores} placeholder="1º Aprovador" />
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
