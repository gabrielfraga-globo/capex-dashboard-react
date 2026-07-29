import { useMemo, useState } from "react";
import type { ProjetoMetricas } from "../types";
import { RiskBadge } from "./ui/primitives";
import { fmtBRL, fmtPct } from "../lib/format";

type RankingKey = "faltaComprometer" | "menorExecucao" | "maiorAEmitir" | "maiorEstouro" | "participacaoRisco";

const RANKINGS: { key: RankingKey; label: string }[] = [
  { key: "faltaComprometer", label: "Maior Falta de Comprometimento" },
  { key: "menorExecucao", label: "Menor Execução" },
  { key: "maiorAEmitir", label: "Maior Valor a Emitir" },
  { key: "maiorEstouro", label: "Maior Estouro Plurianual" },
  { key: "participacaoRisco", label: "Maior Participação no Risco" },
];

function getRanked(lista: ProjetoMetricas[], key: RankingKey): ProjetoMetricas[] {
  const arr = [...lista];
  switch (key) {
    case "faltaComprometer":
      return arr.filter((p) => (p.faltaComprometer ?? 0) > 0).sort((a, b) => (b.faltaComprometer ?? 0) - (a.faltaComprometer ?? 0));
    case "menorExecucao":
      return arr.filter((p) => p.pctExecucao !== null).sort((a, b) => (a.pctExecucao ?? 1) - (b.pctExecucao ?? 1));
    case "maiorAEmitir":
      return arr.filter((p) => (p.aEmitir ?? 0) > 0).sort((a, b) => (b.aEmitir ?? 0) - (a.aEmitir ?? 0));
    case "maiorEstouro":
      return arr.filter((p) => (p.desvioPlurianual ?? 0) > 0).sort((a, b) => (b.desvioPlurianual ?? 0) - (a.desvioPlurianual ?? 0));
    case "participacaoRisco":
      return arr.filter((p) => (p.participacaoRisco ?? 0) > 0).sort((a, b) => (b.participacaoRisco ?? 0) - (a.participacaoRisco ?? 0));
  }
}

function valueFor(p: ProjetoMetricas, key: RankingKey): string {
  switch (key) {
    case "faltaComprometer": return fmtBRL(p.faltaComprometer);
    case "menorExecucao": return fmtPct(p.pctExecucao);
    case "maiorAEmitir": return fmtBRL(p.aEmitir);
    case "maiorEstouro": return fmtBRL(p.desvioPlurianual);
    case "participacaoRisco": return fmtPct(p.participacaoRisco);
  }
}

export function Rankings({ lista, onSelect }: { lista: ProjetoMetricas[]; onSelect: (p: ProjetoMetricas) => void }) {
  const [tab, setTab] = useState<RankingKey>("maiorAEmitir");
  const ranked = useMemo(() => getRanked(lista, tab).slice(0, 10), [lista, tab]);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {RANKINGS.map((r) => (
          <button
            key={r.key}
            onClick={() => setTab(r.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === r.key ? "bg-accent text-white" : "bg-card-alt text-text-muted hover:text-text"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {ranked.length === 0 ? (
        <p className="text-sm text-text-muted">Nenhum projeto nesta categoria para os filtros atuais.</p>
      ) : (
        <div className="divide-y divide-border-subtle">
          {ranked.map((p, i) => (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-card-alt/60 rounded px-2 transition-colors"
            >
              <span className="text-text-faint text-xs w-5">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text truncate">{p.nome}</p>
                <p className="text-[11px] text-text-muted">{p.n4Curta} · {p.gestor ?? "sem gestor"}</p>
              </div>
              <span className="text-sm font-bold text-text">{valueFor(p, tab)}</span>
              <RiskBadge status={p.status} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
