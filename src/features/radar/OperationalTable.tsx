import { useMemo, useState } from "react";
import { buildOperationalRows, buildPipelineCounters, STAGE_LABELS, buildDecisionPayload } from "./operational";
import type { DecisionForm, OperationalRow } from "./operational";
import type { CommitmentSourceBundle, CurationMap, RcCurationUpsertRequest, RcCurationUpsertResponse, DecisionConfidence, DecisionBlocker, PriorityLevel, NonOccurrenceReason } from "./types";
import { CONFIDENCE_LEVELS, BLOCKER_VALUES, PRIORITY_LEVELS, NON_OCCURRENCE_REASONS } from "./types";
import { fmtBRL, fmtNumber } from "../../lib/format";
import { AlertCircle, ChevronUp } from "lucide-react";
import { SidePanel } from "../../components/ui/sidepanel";

interface Props {
  bundle: CommitmentSourceBundle;
  curationMap: CurationMap;
  referenceDateStr: string;
  /** RCs que passaram nos filtros da página (busca, Plataforma, Gestor, 1º Aprovador). */
  allowedRcs: Set<string>;
  salvarRc: (rc: string, payload: RcCurationUpsertRequest) => Promise<RcCurationUpsertResponse | null>;
  erroDe: (chave: string) => string | null;
}

const ENUM_LABELS: Record<string, string> = {
  CONFIRMADO: "Confirmado", PROVAVEL: "Provável", INCERTO: "Incerto",
  ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa",
  CANCELAR: "Cancelar", REDUZIR: "Reduzir", TROCAR_FORNECEDOR: "Trocar fornecedor", ENCERRAR_SALDO: "Encerrar saldo",
  APROVACAO: "Aprovação", COTACAO_LICITACAO: "Cotação / licitação", CONTRATO: "Contrato",
  PROPOSTA_FORNECEDOR: "Proposta do fornecedor", PRAZO_FORNECEDOR: "Prazo do fornecedor", IMPORTACAO: "Importação",
  ENTREGA_PARCIAL: "Entrega parcial", RECEBIMENTO: "Recebimento", NF: "Nota fiscal", ORCAMENTO: "Orçamento",
  SEM_BLOQUEIO: "Sem bloqueio",
};

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
  salvarRc,
  erroDe,
}: Props) {
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [showResidual, setShowResidual] = useState(false);
  const [editingRow, setEditingRow] = useState<OperationalRow | null>(null);
  const [form, setForm] = useState<DecisionForm>({
    naoOcorre: false,
    motivoNaoOcorre: null,
    dataPagamento: null,
    motivoAntecipacao: null,
    confianca: null,
    bloqueio: null,
    proximaAcao: null,
    prioridade: null,
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const handleRowClick = (row: OperationalRow) => {
    setEditingRow(row);
    // Find effective curation for the first commitment to prefill some fields
    const firstKey = bundle.commitments.find(c => c.rc === row.rc)?.commitmentKey;
    const cur = firstKey ? curationMap[firstKey] : null;

    setForm({
      naoOcorre: row.forecast === "NAO_OCORRE",
      motivoNaoOcorre: cur?.nonOccurrenceReason ?? null,
      dataPagamento: row.forecastPaymentDate ?? row.suggestedPaymentDate,
      motivoAntecipacao: cur?.paymentExceptionReason ?? null,
      confianca: row.confidence,
      bloqueio: cur?.blocker ?? null,
      proximaAcao: row.nextAction,
      prioridade: row.priority,
    });
    setLocalError(null);
  };

  const handleSave = async () => {
    if (!editingRow) return;
    try {
      const payload = buildDecisionPayload(editingRow, form, bundle.exerciseYear);
      const rcCommitments = bundle.commitments.filter(c => c.rc === editingRow.rc);
      const targets = rcCommitments.map(c => ({
        commitmentKey: c.commitmentKey,
        sourceValue: c.sourceValue
      }));

      const firstCur = curationMap[targets[0]?.commitmentKey];
      const res = await salvarRc(editingRow.rc, {
        ...payload,
        targets,
        sourceValue: editingRow.value,
        poStatus: firstCur?.poStatus ?? "NO_VISIBILITY", // ignorado no modo DECISAO (a API deriva)
        notes: firstCur?.notes ?? null,
        estimatedDeliveryDate: firstCur?.estimatedDeliveryDate ?? null,
      });
      if (res) {
        setEditingRow(null);
      }
    } catch (err: any) {
      setLocalError(err.message);
    }
  };

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
              <tr key={row.rc} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => handleRowClick(row)}>
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

      <SidePanel open={!!editingRow} onOpenChange={(o) => !o && setEditingRow(null)} title={`Decisão: ${editingRow?.rc}`}>
        {editingRow && (
          <div className="space-y-4">
            <div className="text-sm font-semibold">{editingRow.projectName}</div>
            
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.naoOcorre} onChange={e => setForm(f => ({ ...f, naoOcorre: e.target.checked }))} />
              Não ocorre
            </label>

            {form.naoOcorre && (
              <div>
                <label className="block text-xs font-semibold mb-1">Motivo do Não Ocorrente</label>
                <select className="w-full border rounded p-1 text-sm" value={form.motivoNaoOcorre || ""} onChange={e => setForm(f => ({ ...f, motivoNaoOcorre: e.target.value as NonOccurrenceReason }))}>
                  <option value="">Selecione...</option>
                  {NON_OCCURRENCE_REASONS.filter(r => r !== 'LEGADO').map(r => <option key={r} value={r}>{ENUM_LABELS[r] ?? r}</option>)}
                </select>
              </div>
            )}

            {!form.naoOcorre && (
              <>
                <div>
                  <label className="block text-xs font-semibold mb-1">Data Prevista de Pagamento</label>
                  <input type="date" className="w-full border rounded p-1 text-sm" value={form.dataPagamento || ""} onChange={e => setForm(f => ({ ...f, dataPagamento: e.target.value }))} />
                  {editingRow.suggestedPaymentDate && <div className="text-xs text-text-muted mt-1">Sugerida: {fmtDate(editingRow.suggestedPaymentDate)}</div>}
                </div>

                {form.dataPagamento && editingRow.suggestedPaymentDate && form.dataPagamento < editingRow.suggestedPaymentDate && (
                  <div>
                    <label className="block text-xs font-semibold mb-1">Motivo da antecipação</label>
                    <input type="text" maxLength={120} className="w-full border rounded p-1 text-sm" value={form.motivoAntecipacao || ""} onChange={e => setForm(f => ({ ...f, motivoAntecipacao: e.target.value }))} />
                    <div className="text-[10px] text-right text-text-muted">{(form.motivoAntecipacao || "").length}/120</div>
                  </div>
                )}
              </>
            )}

            <div>
              <label className="block text-xs font-semibold mb-1">Confiança</label>
              <select className="w-full border rounded p-1 text-sm" value={form.confianca || ""} onChange={e => setForm(f => ({ ...f, confianca: (e.target.value || null) as DecisionConfidence | null }))}>
                <option value="">Selecione...</option>
                {CONFIDENCE_LEVELS.map(r => <option key={r} value={r}>{ENUM_LABELS[r] ?? r}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Bloqueio</label>
              <select className="w-full border rounded p-1 text-sm" value={form.bloqueio || ""} onChange={e => setForm(f => ({ ...f, bloqueio: (e.target.value || null) as DecisionBlocker | null }))}>
                <option value="">Selecione...</option>
                {BLOCKER_VALUES.map(r => <option key={r} value={r}>{ENUM_LABELS[r] ?? r}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Próxima ação</label>
              <input type="text" maxLength={80} className="w-full border rounded p-1 text-sm" value={form.proximaAcao || ""} onChange={e => setForm(f => ({ ...f, proximaAcao: e.target.value }))} />
              <div className="text-[10px] text-right text-text-muted">{(form.proximaAcao || "").length}/80</div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Prioridade</label>
              <select className="w-full border rounded p-1 text-sm" value={form.prioridade || ""} onChange={e => setForm(f => ({ ...f, prioridade: (e.target.value || null) as PriorityLevel | null }))}>
                <option value="">Selecione...</option>
                {PRIORITY_LEVELS.map(r => <option key={r} value={r}>{ENUM_LABELS[r] ?? r}</option>)}
              </select>
            </div>

            {localError && <div className="text-sm text-risk-critico mt-2">{localError}</div>}
            {erroDe(`rc:${editingRow.rc}`) && <div className="text-sm text-risk-critico mt-2">{erroDe(`rc:${editingRow.rc}`)}</div>}

            <div className="pt-4 flex justify-end">
              <button onClick={handleSave} className="px-4 py-2 bg-accent text-white rounded text-sm hover:bg-accent/90">Salvar</button>
            </div>
          </div>
        )}
      </SidePanel>
    </div>
  );
}
