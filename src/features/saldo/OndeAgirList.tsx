import { useState, type ReactNode } from "react";
import { fmtBRL, fmtPct } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { SaldoRecorteView } from "../radar/types";
import { SALDO_SIGNAL_TOLERANCE } from "./saldoConfig";
import { mesesDesde, saldoTotalDe } from "./saldo";
import { nivelEstouro } from "./plurianual";

type Aba = "acima" | "parado" | "estouro" | "comprometido";

export type ModoOndeAgir = "2026" | "plurianual";

export interface MetaProjeto {
  n4Curta: string;
  ultimaDataParada?: string | null;
}

interface OndeAgirListProps {
  porProjeto: SaldoRecorteView[];
  meta: Map<string, MetaProjeto>;
  dataReferencia: string;
  exerciseYear: number;
  limit?: number;
  onVerTodos?: () => void;
  modo?: ModoOndeAgir;
}

const VAZIO: Record<Aba, string> = {
  acima: "Nenhum projeto acima do orçamento.",
  parado: "Nenhum projeto com saldo parado.",
  estouro: "Nenhum projeto com estouro de caixa.",
  comprometido: "Nenhum projeto com comprometido acima do plurianual.",
};

const thClass = "px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted";
const tdClass = "px-2 py-2 align-top text-sm text-text";

const plural = (n: number, singular: string, pluralForm: string): string =>
  `${n} ${n === 1 ? singular : pluralForm}`;

export function OndeAgirList({
  porProjeto,
  meta,
  dataReferencia,
  exerciseYear,
  limit = 10,
  onVerTodos,
  modo = "2026",
}: OndeAgirListProps) {
  const plurianual = modo === "plurianual";
  const acima = porProjeto
    .filter((v) => saldoTotalDe(v) < -SALDO_SIGNAL_TOLERANCE)
    .sort((a, b) => saldoTotalDe(a) - saldoTotalDe(b));
  const parado = porProjeto
    .filter((v) => v.saldoPotencial > 0)
    .sort((a, b) => b.saldoPotencial - a.saldoPotencial);
  const estouro = plurianual
    ? porProjeto
        .filter((v) => nivelEstouro(v) === "ESTOURO_CAIXA")
        .sort((a, b) => b.caixa - b.orcamento - (a.caixa - a.orcamento))
    : [];
  const comprometido = plurianual
    ? porProjeto
        .filter((v) => nivelEstouro(v) === "COMPROMETIDO_ACIMA")
        .sort((a, b) => excessoComprometido(b) - excessoComprometido(a))
    : [];

  const listas: Record<Aba, SaldoRecorteView[]> = { acima, parado, estouro, comprometido };
  const abaInicial: Aba = plurianual
    ? estouro.length > 0
      ? "estouro"
      : comprometido.length > 0
        ? "comprometido"
        : "parado"
    : acima.length > 0
      ? "acima"
      : "parado";

  const [aba, setAba] = useState<Aba>(abaInicial);
  const lista = listas[aba];
  const visiveis = lista.slice(0, Math.max(0, limit));

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Onde agir" className="flex flex-wrap gap-2">
        {plurianual ? (
          <>
            <AbaButton id="onde-agir-tab-estouro" ativa={aba === "estouro"} onClick={() => setAba("estouro")}>
              Estouro de caixa ({estouro.length})
            </AbaButton>
            <AbaButton id="onde-agir-tab-comprometido" ativa={aba === "comprometido"} onClick={() => setAba("comprometido")}>
              Comprometido acima ({comprometido.length})
            </AbaButton>
            <AbaButton id="onde-agir-tab-parado" ativa={aba === "parado"} onClick={() => setAba("parado")}>
              Saldo parado · 2026 ({parado.length})
            </AbaButton>
          </>
        ) : (
          <>
            <AbaButton id="onde-agir-tab-acima" ativa={aba === "acima"} onClick={() => setAba("acima")}>
              Acima do orçamento ({acima.length})
            </AbaButton>
            <AbaButton id="onde-agir-tab-parado" ativa={aba === "parado"} onClick={() => setAba("parado")}>
              Saldo parado ({parado.length})
            </AbaButton>
          </>
        )}
      </div>

      <div role="tabpanel" aria-labelledby={`onde-agir-tab-${aba}`}>
        {lista.length === 0 ? (
          <div className="py-4 text-sm text-text-muted">{VAZIO[aba]}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className={thClass}>Projeto</th>
                  <th className={thClass}>Responsável</th>
                  <th className={cn(thClass, "text-right")}>Valor</th>
                  <th className={thClass}>{aba === "parado" ? "Tempo parado" : "Situação"}</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((v) => {
                  if (aba === "acima") return <LinhaAcima key={v.key} v={v} meta={meta} />;
                  if (aba === "parado") {
                    return (
                      <LinhaParada
                        key={v.key}
                        v={v}
                        meta={meta}
                        dataReferencia={dataReferencia}
                        exerciseYear={exerciseYear}
                      />
                    );
                  }
                  return <LinhaPlurianual key={v.key} v={v} meta={meta} tipo={aba} />;
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {onVerTodos && lista.length > limit && (
        <div>
          <button
            type="button"
            onClick={onVerTodos}
            className="text-sm font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 rounded"
          >
            Ver todos os projetos →
          </button>
        </div>
      )}
    </div>
  );
}

function AbaButton({
  id,
  ativa,
  onClick,
  children,
}: {
  id: string;
  ativa: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={ativa}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
        ativa ? "border-accent border-2 font-semibold text-text" : "border-border text-text-muted hover:bg-card-alt"
      )}
    >
      {children}
    </button>
  );
}

function ProjetoCelula({ v, meta }: { v: SaldoRecorteView; meta: Map<string, MetaProjeto> }) {
  const programa = meta.get(v.key)?.n4Curta;
  return (
    <>
      <div className="font-medium">{v.label}</div>
      {programa && <div className="text-[11px] text-text-faint">{programa}</div>}
    </>
  );
}

function LinhaAcima({ v, meta }: { v: SaldoRecorteView; meta: Map<string, MetaProjeto> }) {
  const total = saldoTotalDe(v);
  const comprometido = v.caixa + v.compromissoTotal;
  const situacao =
    v.orcamento === 0
      ? "sem orçamento"
      : `comprometido ${fmtPct(comprometido / v.orcamento, 0)} do orçamento`;

  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className={tdClass}>
        <ProjetoCelula v={v} meta={meta} />
      </td>
      <td className={tdClass}>{v.aprovador ?? "–"}</td>
      <td className={cn(tdClass, "text-right tabular-nums text-risk-critico font-semibold")} title={fmtBRL(total)}>
        −{fmtBRL(Math.abs(total), true)}
      </td>
      <td className={cn(tdClass, "text-text-muted")}>{situacao}</td>
    </tr>
  );
}

function excessoComprometido(v: SaldoRecorteView): number {
  return v.caixa + v.compromissoTotal - v.orcamento;
}

function LinhaPlurianual({
  v,
  meta,
  tipo,
}: {
  v: SaldoRecorteView;
  meta: Map<string, MetaProjeto>;
  tipo: "estouro" | "comprometido";
}) {
  const base = tipo === "estouro" ? v.caixa : v.caixa + v.compromissoTotal;
  const valor = tipo === "estouro" ? v.caixa - v.orcamento : excessoComprometido(v);
  const situacao =
    v.orcamento === 0
      ? "sem orçamento plurianual"
      : `${tipo === "estouro" ? "caixa" : "comprometido"} ${fmtPct(base / v.orcamento, 0)} do plurianual`;

  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className={tdClass}>
        <ProjetoCelula v={v} meta={meta} />
      </td>
      <td className={tdClass}>{v.aprovador ?? "–"}</td>
      <td className={cn(tdClass, "text-right tabular-nums text-risk-critico font-semibold")} title={fmtBRL(valor)}>
        {fmtBRL(valor, true)}
      </td>
      <td className={cn(tdClass, "text-text-muted")}>{situacao}</td>
    </tr>
  );
}

function LinhaParada({
  v,
  meta,
  dataReferencia,
  exerciseYear,
}: {
  v: SaldoRecorteView;
  meta: Map<string, MetaProjeto>;
  dataReferencia: string;
  exerciseYear: number;
}) {
  const metaProjeto = meta.get(v.key);
  const dataParada = metaProjeto && "ultimaDataParada" in metaProjeto ? metaProjeto.ultimaDataParada : v.ultimaDataCompromisso;
  const meses = mesesDesde(dataParada ?? null, dataReferencia);
  const tempo =
    meses === null
      ? `sem compromisso aprovado em ${exerciseYear}`
      : `parado há ${plural(Math.max(0, meses), "mês", "meses")}`;

  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className={tdClass}>
        <ProjetoCelula v={v} meta={meta} />
      </td>
      <td className={tdClass}>{v.aprovador ?? "–"}</td>
      <td className={cn(tdClass, "text-right tabular-nums font-semibold")} title={fmtBRL(v.saldoPotencial)}>
        {fmtBRL(v.saldoPotencial, true)}
      </td>
      <td className={cn(tdClass, "text-text-muted")}>{tempo}</td>
    </tr>
  );
}
