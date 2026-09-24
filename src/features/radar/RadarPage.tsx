import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Card, KpiCard, SectionHeader } from "../../components/ui/primitives";
import { Select } from "../../components/ui/select";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { fmtBRL, fmtNumber } from "../../lib/format";
import { navigate } from "../../lib/simpleRouter";
import { CommitmentTable } from "./CommitmentTable";
import { useCuration } from "./useCuration";
import { precisaAtencao } from "./RcRow";

function formatGeradoEm(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
}

export function RadarPage() {
  const { isLoading, error, bundle, views, rcViews, resumo, isSaving, erroDe, salvarChave, salvarRc } = useCuration();
  const [busca, setBusca] = useState("");
  const [projetoFiltro, setProjetoFiltro] = useState<string | null>(null);
  const [fornecedorFiltro, setFornecedorFiltro] = useState<string | null>(null);
  const [soNaoCurados, setSoNaoCurados] = useState(true);

  const opcoesProjeto = useMemo(() => {
    const nomes = Array.from(new Set(views.map((v) => v.projectName))).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return nomes.map((n) => ({ value: n, label: n }));
  }, [views]);

  const opcoesFornecedor = useMemo(() => {
    const nomes = Array.from(new Set(views.map((v) => v.supplier))).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return nomes.map((n) => ({ value: n, label: n }));
  }, [views]);

  const rcsPendentes = useMemo(() => rcViews.filter(precisaAtencao).length, [rcViews]);

  const rcViewsFiltradas = useMemo(() => {
    const buscaLower = busca.trim().toLowerCase();
    return rcViews.filter((rc) => {
      if (soNaoCurados && !precisaAtencao(rc)) return false;
      if (projetoFiltro && !rc.commitments.some((c) => c.projectName === projetoFiltro)) return false;
      if (fornecedorFiltro && !rc.suppliers.includes(fornecedorFiltro)) return false;
      if (buscaLower && !rc.rc.toLowerCase().includes(buscaLower)) return false;
      return true;
    });
  }, [rcViews, soNaoCurados, projetoFiltro, fornecedorFiltro, busca]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text"
          >
            <ArrowLeft size={15} /> Voltar
          </button>
          <h1 className="text-lg font-bold text-text">Radar de Risco de Caixa</h1>
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KpiCard label="BG Times" value={fmtBRL(resumo.bgCurated, true)} sub="curadoria do exercício" />
              <KpiCard
                label={`Carryover ${resumo.exerciseYear + 1}`}
                value={fmtBRL(resumo.carryover, true)}
                sub="pagamento previsto após o exercício"
              />
              <KpiCard
                label="Sem avaliação"
                value={fmtBRL(resumo.notCurated, true)}
                sub={`${fmtNumber(rcsPendentes)} RC${rcsPendentes === 1 ? "" : "s"} pendente${rcsPendentes === 1 ? "" : "s"}`}
              />
            </div>
          )}

          <Card>
            <SectionHeader title="Filtros" />
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Buscar RC…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="rounded-md border border-border bg-card-alt px-3 py-1.5 text-xs text-text min-w-[140px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              />
              <Select value={projetoFiltro} onValueChange={setProjetoFiltro} options={opcoesProjeto} placeholder="Projeto" />
              <Select value={fornecedorFiltro} onValueChange={setFornecedorFiltro} options={opcoesFornecedor} placeholder="Fornecedor" />
              <label className="inline-flex items-center gap-1.5 text-xs text-text-muted ml-auto">
                <input type="checkbox" checked={soNaoCurados} onChange={(e) => setSoNaoCurados(e.target.checked)} />
                só sem avaliação
              </label>
            </div>
          </Card>

          <CommitmentTable
            rcViews={rcViewsFiltradas}
            isSaving={isSaving}
            erroDe={erroDe}
            onSalvarRc={salvarRc}
            onSalvarChave={salvarChave}
          />
        </>
      )}
    </div>
  );
}
