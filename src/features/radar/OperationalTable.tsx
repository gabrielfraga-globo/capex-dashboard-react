import { useMemo, useState } from "react";
import { buildOperationalRows, buildPipelineCounters, STAGE_LABELS } from "./operational";
import type { CommitmentSourceBundle, CurationMap } from "./types";
import { fmtBRL, fmtNumber } from "../../lib/format";
import { AlertCircle, ChevronUp } from "lucide-react";

interface Props {
  bundle: CommitmentSourceBundle;
  curationMap: CurationMap;
  referenceDateStr: string;
  /** RCs que passaram nos filtros da página (busca, Plataforma, Gestor, 1º Aprovador). */
  allowedRcs: Set<string>;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y.slice(2)}` : iso;
}

export function OperationalTable({
  bundle,
  curationMap,
  referenceDateStr,
  allowedRcs,
}: Props) {
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [showResidual, setShowResidual] = useState(false);

  const allRows = useMemo(() => {
    return buildOperationalRows(bundle, curationMap, referenceDateStr);
  }, [bundle, curationMap, referenceDateStr]);

  const filteredRows = useMemo(() => allRows.filter((r) => allowedRcs.has(r.rc)), [allRows, allowedRcs]);

  const counters = useMemo(() => {
    return buildPipelineCounters(filteredRows, bundle.payments);
  }, [filteredRows, bundle.payments]);

  const displayRows = useMemo(() => {
    let res = filteredRows;
    if (!showResidual) {
      res = res.filter((r) => !r.isResidual);
    }
    if (selectedStage) {
      if (selectedStage === "NO_FORECAST") {
        res = res.filter((r) => !r.forecast);
      } else {
        res = res.filter((r) => r.stage === selectedStage);
      }
    }
    return res;
  }, [filteredRows, showResidual, selectedStage]);

  const toggleStage = (stage: string) => {
    setSelectedStage((prev) => (prev === stage ? null : stage));
  };

  return (
    <div className="space-y-4">
      {/* Counters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {["E1", "E2", "E3", "E4", "E5", "E6", "E7"].map((s) => {
          const c = counters.byStage[s];
          if (!c) return null;
          const isSelected = selectedStage === s;
          return (
            <button
              key={s}
              onClick={() => toggleStage(s)}
              className={`px-3 py-2 rounded border text-xs text-left transition-colors ${
                isSelected
                  ? "bg-accent text-accent-fg border-accent"
                  : "bg-card border-border hover:border-text-muted text-text"
              }`}
            >
              <div className="font-bold">{s} · {STAGE_LABELS[s]}</div>
              <div className="text-text-muted text-[10px]">{fmtNumber(c.count)} • {fmtBRL(c.value)}</div>
            </button>
          );
        })}
        <button
          onClick={() => toggleStage("NO_FORECAST")}
          className={`px-3 py-2 rounded border text-xs text-left transition-colors ${
            selectedStage === "NO_FORECAST"
              ? "bg-accent text-accent-fg border-accent"
              : "bg-card border-border hover:border-text-muted text-text"
          }`}
        >
          <div className="font-bold">Sem Previsão</div>
          <div className="text-text-muted text-[10px]">
            {fmtNumber(counters.noForecast.count)} • {fmtBRL(counters.noForecast.value)}
          </div>
        </button>

        <label className="ml-auto flex items-center gap-2 text-xs text-text cursor-pointer">
          <input
            type="checkbox"
            checked={showResidual}
            onChange={(e) => setShowResidual(e.target.checked)}
            className="rounded border-border"
          />
          Mostrar Residuais
        </label>
      </div>

      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full table-fixed text-left text-xs text-text border-collapse">
          <colgroup>
            <col className="w-[130px]" />
            <col />
            <col className="w-[100px]" />
            <col className="w-[150px]" />
            <col className="w-[70px]" />
            <col className="w-[170px]" />
            <col className="w-[140px]" />
            <col className="w-[175px]" />
            <col className="w-[85px]" />
          </colgroup>
          <thead className="bg-muted text-text-muted border-b border-border">
            <tr>
              <th className="p-2 font-medium whitespace-nowrap">RC</th>
              <th className="p-2 font-medium">Projeto / Fornecedor</th>
              <th className="p-2 font-medium text-right">Valor</th>
              <th className="p-2 font-medium">Etapa</th>
              <th className="p-2 font-medium text-right">Dias</th>
              <th className="p-2 font-medium">Responsável</th>
              <th className="p-2 font-medium">Próxima ação</th>
              <th className="p-2 font-medium">Previsão caixa</th>
              <th className="p-2 font-medium">Confiança</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {displayRows.map((row) => (
              <tr key={row.rc} className="hover:bg-muted/50 transition-colors">
                <td className="p-2 whitespace-nowrap">
                  <div className="flex items-center gap-1 font-semibold">
                    {row.priority === "ALTA" && <ChevronUp size={14} className="text-text" aria-label="Prioridade alta" />}
                    {row.rc}
                  </div>
                  {row.ocCount > 1 && (
                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded-full bg-border text-[9px] text-text-muted font-medium tracking-wide uppercase">
                      {row.ocCount} OCs
                    </span>
                  )}
                </td>
                <td className="p-2 min-w-0">
                  <div className="font-medium text-text truncate" title={row.projectName}>{row.projectName || "-"}</div>
                  <div className="text-text-muted text-[11px] truncate">
                    {row.supplier || "-"}
                  </div>
                </td>
                <td className="p-2 text-right font-medium whitespace-nowrap">
                  {fmtBRL(row.value)}
                </td>
                <td className="p-2">
                  <div
                    className="inline-flex items-center font-medium px-2 py-0.5 rounded bg-muted text-text cursor-help"
                    title={`Status RC: ${row.tooltip.statusRc || "—"}\nStatus compromisso: ${row.tooltip.statusCompromisso || "—"}\nOC: ${row.tooltip.oc || "—"}\nComprador: ${row.tooltip.comprador || "—"}\nData prometida: ${fmtDate(row.tooltip.dataPrometida)}`}
                  >
                    {row.stage} · {STAGE_LABELS[row.stage] ?? row.stage}
                  </div>
                </td>
                <td className="p-2 text-right whitespace-nowrap" title={row.stage === "E4" ? "E4: dias de atraso em relação à data prometida" : "Dias na etapa"}>
                  {row.daysInStage == null ? "—" : row.stage === "E4" ? (row.daysInStage < 0 ? `faltam ${-row.daysInStage}` : `${row.daysInStage} atraso`) : row.daysInStage}
                </td>
                <td className="p-2 min-w-0">
                  <div className="truncate text-text" title={row.owner}>
                    {row.owner || "-"}
                  </div>
                </td>
                <td className="p-2 min-w-0">
                  <div className="truncate" title={row.nextAction || undefined}>
                    {row.nextAction || "-"}
                  </div>
                </td>
                <td className="p-2 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-muted text-text font-medium">
                      {row.forecast === "CAIXA_EXERCICIO" ? `Caixa ${String(bundle.exerciseYear).slice(2)}` : row.forecast === "CAIXA_PROXIMO_EXERCICIO" ? `Caixa ${String(bundle.exerciseYear + 1).slice(2)}` : row.forecast === "NAO_OCORRE" ? "Não ocorre" : "—"}
                    </span>
                    <span className="text-text-muted">
                      {fmtDate(row.forecastPaymentDate ?? row.suggestedPaymentDate)}{!row.forecastPaymentDate && row.suggestedPaymentDate ? " (sug.)" : ""}
                    </span>
                    {row.isEarlyException && (
                      <div className="text-text-muted cursor-help" title={`Antecipado vs. sugerido (${fmtDate(row.suggestedPaymentDate)})`}>
                        <AlertCircle size={14} />
                      </div>
                    )}
                  </div>
                </td>
                <td className="p-2">
                  {row.confidence === "CONFIRMADO" ? "Confirmado" : row.confidence === "PROVAVEL" ? "Provável" : row.confidence === "INCERTO" ? "Incerto" : "-"}
                </td>
              </tr>
            ))}
            {displayRows.length === 0 && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-text-muted">
                  Nenhuma RC encontrada para os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
