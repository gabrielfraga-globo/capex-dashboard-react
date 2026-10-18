import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight } from "lucide-react";
import type { SaldoProjetoLinha, SaldoRecorteView, SaldoSignal } from "../radar/types";
import { Card } from "../../components/ui/primitives";
import { fmtBRL, fmtPct } from "../../lib/format";
import { mesesDesde } from "./saldo";

type SortDirection = "asc" | "desc";

type SaldoSortKey =
  | "projeto"
  | "aprovador"
  | "programa"
  | "orcamento"
  | "caixa"
  | "pctCaixa"
  | "compromissoValido"
  | "compromissoLegado"
  | "saldoDisponivel"
  | "saldoPotencial"
  | "ultimoCompromisso"
  | "sinal";

type SortValue = string | number | null;

const SIGNAL_LABEL: Record<SaldoSignal, string> = {
  ESTOURO_CAIXA: "Estouro de caixa",
  SEM_ORCAMENTO: "Sem orçamento",
  COMPROMETIDO_ACIMA: "Comprometido acima",
  SALDO_PARADO: "Saldo parado",
  SALDO_RESIDUAL: "Saldo residual",
  EM_EXECUCAO: "Em execução",
};

const SIGNAL_TONE: Record<SaldoSignal, string> = {
  ESTOURO_CAIXA: "border-risk-critico text-risk-critico",
  SEM_ORCAMENTO: "border-border text-text-muted",
  COMPROMETIDO_ACIMA: "border-risk-alto text-risk-alto",
  SALDO_PARADO: "border-risk-medio text-risk-medio",
  SALDO_RESIDUAL: "border-risk-revisao text-risk-revisao",
  EM_EXECUCAO: "border-risk-baixo text-risk-baixo",
};

const COLUNAS: { key: SaldoSortKey; label: string; numerica: boolean; alinhamento: "left" | "right" }[] = [
  { key: "projeto", label: "Projeto", numerica: false, alinhamento: "left" },
  { key: "aprovador", label: "Aprovador", numerica: false, alinhamento: "left" },
  { key: "programa", label: "Programa", numerica: false, alinhamento: "left" },
  { key: "orcamento", label: "Orçamento", numerica: true, alinhamento: "right" },
  { key: "caixa", label: "Caixa", numerica: true, alinhamento: "right" },
  { key: "pctCaixa", label: "% Caixa", numerica: true, alinhamento: "right" },
  { key: "compromissoValido", label: "Comp. válido", numerica: true, alinhamento: "right" },
  { key: "compromissoLegado", label: "Comp. legado", numerica: true, alinhamento: "right" },
  { key: "saldoDisponivel", label: "Saldo disp.", numerica: true, alinhamento: "right" },
  { key: "saldoPotencial", label: "Saldo pot.", numerica: true, alinhamento: "right" },
  { key: "ultimoCompromisso", label: "Último compromisso", numerica: false, alinhamento: "left" },
  { key: "sinal", label: "Sinal", numerica: false, alinhamento: "left" },
];

interface ProjetoRow {
  view: SaldoRecorteView;
  programa: string;
  meses: number | null;
}

function valorOrdenacao(row: ProjetoRow, key: SaldoSortKey): SortValue {
  const v = row.view;
  switch (key) {
    case "projeto": return v.label;
    case "aprovador": return v.aprovador;
    case "programa": return row.programa;
    case "orcamento": return v.orcamento;
    case "caixa": return v.caixa;
    case "pctCaixa": return v.pctCaixa;
    case "compromissoValido": return v.compromissoValido;
    case "compromissoLegado": return v.compromissoLegado;
    case "saldoDisponivel": return v.saldoDisponivel;
    case "saldoPotencial": return v.saldoPotencial;
    case "ultimoCompromisso": return v.ultimaDataCompromisso;
    case "sinal": return SIGNAL_LABEL[v.signal];
  }
}

function compararValores(a: SortValue, b: SortValue): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base" });
}

function textoUltimoCompromisso(meses: number | null, exercicio: number): string {
  if (meses === null) return `sem compromisso aprovado em ${exercicio}`;
  if (meses <= 0) return "neste mês";
  return meses === 1 ? "há 1 mês" : `há ${meses} meses`;
}

function Negativo({ v, children }: { v: number; children: React.ReactNode }) {
  return <span className={v < 0 ? "text-risk-critico" : ""}>{children}</span>;
}

export interface ProjetoSaldoTableProps {
  views: SaldoRecorteView[];
  linhasPorProjeto: Map<string, SaldoProjetoLinha[]>;
  meta: Map<string, { n4Curta: string }>;
  dataReferencia: string;
  exerciseYear: number;
}

export function ProjetoSaldoTable({ views, linhasPorProjeto, meta, dataReferencia, exerciseYear }: ProjetoSaldoTableProps) {
  const [sortKey, setSortKey] = useState<SaldoSortKey>("saldoPotencial");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [expandidos, setExpandidos] = useState<Set<string>>(() => new Set());

  const linhas = useMemo<ProjetoRow[]>(() => {
    const base = views.map((view) => ({
      view,
      programa: meta.get(view.key)?.n4Curta ?? "—",
      meses: mesesDesde(view.ultimaDataCompromisso, dataReferencia),
    }));
    const fator = direction === "asc" ? 1 : -1;
    return base
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const cmp = compararValores(valorOrdenacao(a.row, sortKey), valorOrdenacao(b.row, sortKey));
        return cmp === 0 ? a.index - b.index : cmp * fator;
      })
      .map(({ row }) => row);
  }, [views, meta, dataReferencia, sortKey, direction]);

  const totais = useMemo(() => {
    const t = { orcamento: 0, caixa: 0, compromissoValido: 0, compromissoLegado: 0, saldoDisponivel: 0, saldoPotencial: 0 };
    for (const v of views) {
      t.orcamento += v.orcamento;
      t.caixa += v.caixa;
      t.compromissoValido += v.compromissoValido;
      t.compromissoLegado += v.compromissoLegado;
      t.saldoDisponivel += v.saldoDisponivel;
      t.saldoPotencial += v.saldoPotencial;
    }
    return t;
  }, [views]);

  function ordenarPor(key: SaldoSortKey) {
    if (key === sortKey) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDirection(COLUNAS.find((c) => c.key === key)?.numerica ? "desc" : "asc");
    }
  }

  function alternarExpansao(key: string) {
    setExpandidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(key)) proximo.delete(key);
      else proximo.add(key);
      return proximo;
    });
  }

  return (
    <Card>
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Projetos e saldo</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-xs tabular-nums">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="w-8 px-2 py-2" aria-label="Expandir" />
              {COLUNAS.map((c) => {
                const ativa = c.key === sortKey;
                const Icone = ativa ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={ativa ? (direction === "asc" ? "ascending" : "descending") : "none"}
                    className={`px-2 py-2 font-medium ${c.alinhamento === "right" ? "text-right" : "text-left"}`}
                  >
                    <button
                      type="button"
                      onClick={() => ordenarPor(c.key)}
                      className="inline-flex items-center gap-1 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 rounded"
                    >
                      {c.label}
                      <Icone size={12} aria-hidden="true" className={ativa ? "text-accent" : "text-text-faint"} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={COLUNAS.length + 1} className="px-2 py-6 text-center text-sm text-text-muted">
                  Nenhum projeto neste recorte.
                </td>
              </tr>
            )}
            {linhas.map((row) => {
              const v = row.view;
              const aberto = expandidos.has(v.key);
              const rubricas = linhasPorProjeto.get(v.key) ?? [];
              return (
                <ProjetoLinhaFragment
                  key={v.key}
                  row={row}
                  aberto={aberto}
                  rubricas={rubricas}
                  exerciseYear={exerciseYear}
                  onToggle={() => alternarExpansao(v.key)}
                />
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border font-semibold text-text">
              <td />
              <td className="px-2 py-2 text-left" colSpan={3}>Total ({views.length})</td>
              <td className="px-2 py-2 text-right"><Negativo v={totais.orcamento}>{fmtBRL(totais.orcamento)}</Negativo></td>
              <td className="px-2 py-2 text-right"><Negativo v={totais.caixa}>{fmtBRL(totais.caixa)}</Negativo></td>
              <td className="px-2 py-2 text-right">{fmtPct(totais.orcamento === 0 ? null : totais.caixa / totais.orcamento)}</td>
              <td className="px-2 py-2 text-right"><Negativo v={totais.compromissoValido}>{fmtBRL(totais.compromissoValido)}</Negativo></td>
              <td className="px-2 py-2 text-right"><Negativo v={totais.compromissoLegado}>{fmtBRL(totais.compromissoLegado)}</Negativo></td>
              <td className="px-2 py-2 text-right"><Negativo v={totais.saldoDisponivel}>{fmtBRL(totais.saldoDisponivel)}</Negativo></td>
              <td className="px-2 py-2 text-right"><Negativo v={totais.saldoPotencial}>{fmtBRL(totais.saldoPotencial)}</Negativo></td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

function ProjetoLinhaFragment({
  row,
  aberto,
  rubricas,
  exerciseYear,
  onToggle,
}: {
  row: ProjetoRow;
  aberto: boolean;
  rubricas: SaldoProjetoLinha[];
  exerciseYear: number;
  onToggle: () => void;
}) {
  const v = row.view;
  const Chevron = aberto ? ChevronDown : ChevronRight;
  const celula = "px-2 py-2 text-right";
  return (
    <>
      <tr className="border-b border-border/60 text-text hover:bg-card-alt">
        <td className="px-2 py-2">
          <button
            type="button"
            aria-expanded={aberto}
            aria-label={`${aberto ? "Recolher" : "Expandir"} rubricas de ${v.label}`}
            onClick={onToggle}
            className="rounded p-0.5 text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            <Chevron size={14} aria-hidden="true" />
          </button>
        </td>
        <td className="px-2 py-2 text-left font-medium">{v.label}</td>
        <td className="px-2 py-2 text-left text-text-muted">{v.aprovador ?? "—"}</td>
        <td className="px-2 py-2 text-left text-text-muted">{row.programa}</td>
        <td className={celula}><Negativo v={v.orcamento}>{fmtBRL(v.orcamento)}</Negativo></td>
        <td className={celula}><Negativo v={v.caixa}>{fmtBRL(v.caixa)}</Negativo></td>
        <td className={celula}>{fmtPct(v.pctCaixa)}</td>
        <td className={celula}><Negativo v={v.compromissoValido}>{fmtBRL(v.compromissoValido)}</Negativo></td>
        <td className={celula}><Negativo v={v.compromissoLegado}>{fmtBRL(v.compromissoLegado)}</Negativo></td>
        <td className={celula}><Negativo v={v.saldoDisponivel}>{fmtBRL(v.saldoDisponivel)}</Negativo></td>
        <td className={celula}><Negativo v={v.saldoPotencial}>{fmtBRL(v.saldoPotencial)}</Negativo></td>
        <td className="px-2 py-2 text-left text-text-muted">{textoUltimoCompromisso(row.meses, exerciseYear)}</td>
        <td className="px-2 py-2 text-left">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${SIGNAL_TONE[v.signal]}`}>{SIGNAL_LABEL[v.signal]}</span>
        </td>
      </tr>
      {aberto && (
        <tr className="bg-card-alt text-text-muted">
          <td />
          <td colSpan={12} className="px-2 py-2">
            {rubricas.length === 0 ? (
              <span>Nenhuma rubrica neste projeto.</span>
            ) : (
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="text-text-faint">
                    <th className="px-2 py-1 text-left font-medium">Rubrica</th>
                    <th className="px-2 py-1 text-right font-medium">Orçamento</th>
                    <th className="px-2 py-1 text-right font-medium">Caixa</th>
                    <th className="px-2 py-1 text-right font-medium">Comp. válido</th>
                    <th className="px-2 py-1 text-right font-medium">Comp. legado</th>
                    <th className="px-2 py-1 text-right font-medium">Saldo disp.</th>
                    <th className="px-2 py-1 text-right font-medium">Saldo pot.</th>
                  </tr>
                </thead>
                <tbody>
                  {rubricas.map((l) => (
                    <tr key={`${l.projectKey}|${l.rubrica}`} className="border-t border-border/40">
                      <td className="px-2 py-1 text-left text-text">{l.rubrica}</td>
                      <td className={celula}><Negativo v={l.orcamento}>{fmtBRL(l.orcamento)}</Negativo></td>
                      <td className={celula}><Negativo v={l.caixa}>{fmtBRL(l.caixa)}</Negativo></td>
                      <td className={celula}><Negativo v={l.compromissoValido}>{fmtBRL(l.compromissoValido)}</Negativo></td>
                      <td className={celula}><Negativo v={l.compromissoTotal - l.compromissoValido}>{fmtBRL(l.compromissoTotal - l.compromissoValido)}</Negativo></td>
                      <td className={celula}><Negativo v={l.saldoDisponivel}>{fmtBRL(l.saldoDisponivel)}</Negativo></td>
                      <td className={celula}><Negativo v={l.saldoPotencial}>{fmtBRL(l.saldoPotencial)}</Negativo></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
