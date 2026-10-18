import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { navigate } from "../../lib/simpleRouter";
import { usePortfolioData } from "../../hooks/usePortfolioData";
import { useSaldoProjetos } from "./useSaldoProjetos";
import { Button, Card } from "../../components/ui/primitives";
import { Select } from "../../components/ui/select";
import { SkeletonList } from "../../components/ui/SkeletonCard";
import { SaldoBridge } from "./SaldoBridge";
import { SaldoPotencialCard } from "./SaldoPotencialCard";
import { RubricaRiskPanel } from "./RubricaRiskPanel";
import { ProjetoSaldoTable } from "./ProjetoSaldoTable";
import { SaldoAuditPanel } from "./SaldoAuditPanel";
import { aggregateSaldoBy, filterSaldoLinhas, summarizeSaldo } from "./saldo";
import type { SaldoProjetoLinha, SaldoProjetosSection } from "../radar/types";

function formatarDataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function RiscoCaixaPage() {
  const state = useSaldoProjetos();
  const { parsed } = usePortfolioData();

  const [programa, setPrograma] = useState<string | null>(null);
  const [rubricas, setRubricas] = useState<string[]>([]);
  const [aprovador, setAprovador] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

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
      Array.from(new Set(linhasBase.map((l) => l.rubrica)))
        .sort((a, b) => a.localeCompare(b, "pt-BR"))
        .map((r) => ({ value: r, label: r })),
    [linhasBase],
  );

  const aprovadorOptions = useMemo(
    () =>
      Array.from(new Set(linhasBase.map((l) => l.aprovador).filter((a): a is string => !!a)))
        .sort((a, b) => a.localeCompare(b, "pt-BR"))
        .map((a) => ({ value: a, label: a })),
    [linhasBase],
  );

  const projectKeys = useMemo<ReadonlySet<string> | undefined>(() => {
    if (!programa) return undefined;
    const keys = new Set<string>();
    for (const p of projetos) if (p.n4Curta === programa) keys.add(p.id);
    return keys;
  }, [programa, projetos]);

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

  const linhasPorProjeto = useMemo(() => {
    const m = new Map<string, SaldoProjetoLinha[]>();
    for (const l of linhas) {
      const arr = m.get(l.projectKey);
      if (arr) arr.push(l);
      else m.set(l.projectKey, [l]);
    }
    return m;
  }, [linhas]);

  const temFiltro = !!programa || rubricas.length > 0 || !!aprovador || busca.trim() !== "";

  function limparFiltros() {
    setPrograma(null);
    setRubricas([]);
    setAprovador(null);
    setBusca("");
  }

  function alternarRubrica(r: string) {
    setRubricas((atual) => (atual.includes(r) ? atual.filter((x) => x !== r) : [...atual, r]));
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
          {section && (
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
        {section && (
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

    corpo = (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <SaldoBridge totals={totals} exerciseYear={state.section.exerciseYear} hidden={!ok} />
          </div>
          <div className="lg:col-span-4">
            {ok ? (
              <SaldoPotencialCard variant="full" projectKeys={projectKeys} rubricas={rubricasFiltro} hideCta />
            ) : (
              <Card>
                <div className="text-sm text-risk-critico">
                  Saldo potencial oculto: a conciliação com a carteira não confere.
                </div>
              </Card>
            )}
          </div>
        </div>

        <Card>
          <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-text-muted">
              Programa
              <Select value={programa} onValueChange={setPrograma} options={programaOptions} placeholder="Todos os programas" />
            </label>
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
        </Card>

        {linhas.length === 0 ? (
          <Card>
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-text-muted">Nenhum projeto corresponde aos filtros selecionados.</p>
              <Button variant="outline" onClick={limparFiltros} disabled={!temFiltro}>
                Limpar filtros
              </Button>
            </div>
          </Card>
        ) : (
          <>
            <RubricaRiskPanel views={viewsRubrica} selected={rubricas} onToggle={alternarRubrica} />
            <ProjetoSaldoTable
              views={viewsProjeto}
              linhasPorProjeto={linhasPorProjeto}
              meta={meta}
              dataReferencia={state.section.dataReferencia}
              exerciseYear={state.section.exerciseYear}
            />
          </>
        )}

        <SaldoAuditPanel section={state.section} projetos={projetos} />
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
