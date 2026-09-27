import { useMemo, useState, useRef, useEffect } from "react";
import { buildOperationalRows, buildPipelineCounters, STAGE_LABELS, suggestClassification, buildClassificationPayload, deliveryFromPayment } from "./operational";
import type { OperationalRow } from "./operational";
import type { CommitmentSourceBundle, CurationMap, RcCurationUpsertRequest, RcCurationUpsertResponse, NonOccurrenceReason } from "./types";
import { NON_OCCURRENCE_REASONS } from "./types";
import { fmtBRL, fmtNumber } from "../../lib/format";
import { Star, Edit2 } from "lucide-react";

interface Props {
  bundle: CommitmentSourceBundle;
  curationMap: CurationMap;
  referenceDateStr: string;
  allowedRcs: Set<string>;
  salvarRc: (rc: string, payload: RcCurationUpsertRequest) => Promise<RcCurationUpsertResponse | null>;
  erroDe: (chave: string) => string | null;
}

const ENUM_LABELS: Record<string, string> = {
  CANCELAR: "Cancelar", REDUZIR: "Reduzir", TROCAR_FORNECEDOR: "Trocar fornecedor", ENCERRAR_SALDO: "Encerrar saldo",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y.slice(2)}` : iso;
}

function RcRowOperational({ row, exerciseYear, bundle, salvarRc, erroDe }: { row: OperationalRow, exerciseYear: number, bundle: CommitmentSourceBundle, curationMap: CurationMap, salvarRc: Props["salvarRc"], erroDe: Props["erroDe"] }) {
  const [editingDelivery, setEditingDelivery] = useState<string | null>(null);
  const [editingAction, setEditingAction] = useState<boolean>(false);
  const [actionVal, setActionVal] = useState(row.nextAction || "");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const actionInputRef = useRef<HTMLInputElement>(null);
  const deliveryInputRef = useRef<HTMLInputElement>(null);

  const rcCommitments = bundle.commitments.filter(c => c.rc === row.rc);
  const targets = rcCommitments.map(c => ({ commitmentKey: c.commitmentKey, sourceValue: c.sourceValue }));
  
  const suggestedClass = suggestClassification(row, exerciseYear);
  
  let currentClass: string | null = null;
  if (row.forecast === "NAO_OCORRE") currentClass = "NAO_OCORRE";
  else if (row.forecast === "CAIXA_PROXIMO_EXERCICIO") currentClass = "CAIXA_27";
  else if (row.confidence === "INCERTO") currentClass = "EM_RISCO";
  else if (row.forecast === "CAIXA_EXERCICIO") currentClass = "CAIXA_26";

  const isConfirmed = !!currentClass;
  const activeClass = currentClass || suggestedClass;

  const payment = row.forecastPaymentDate ?? row.suggestedPaymentDate;
  const deliveryDateDisplayed = payment ? deliveryFromPayment(payment) : null;

  useEffect(() => {
    if (editingAction && actionInputRef.current) actionInputRef.current.focus();
  }, [editingAction]);

  useEffect(() => {
    if (editingDelivery !== null && deliveryInputRef.current) deliveryInputRef.current.focus();
  }, [editingDelivery]);

  const doSave = async (estado: any, options: any) => {
    const payload = buildClassificationPayload(row, estado, options, exerciseYear);
    await salvarRc(row.rc, { ...payload, targets, sourceValue: row.value } as RcCurationUpsertRequest);
  };

  const handleClassify = async (estado: "CAIXA_26" | "EM_RISCO" | "CAIXA_27" | "NAO_OCORRE", motivo?: NonOccurrenceReason) => {
    try {
      await doSave(estado, { entregaEsperada: deliveryDateDisplayed, motivo });
      setPopoverOpen(false);
    } catch (e: any) {
      if (e.message === "Informe a entrega esperada") {
        setEditingDelivery(deliveryDateDisplayed || "");
      } else {
        alert(e.message);
      }
    }
  };

  const saveDelivery = async () => {
    const val = editingDelivery;
    setEditingDelivery(null);
    if (!val || val === deliveryDateDisplayed) return;
    try {
      const estado = currentClass || suggestedClass;
      if (estado === "NAO_OCORRE") return;
      await doSave(estado, { entregaEsperada: val });
    } catch (e: any) { alert(e.message); }
  };

  const saveAction = async () => {
    setEditingAction(false);
    if (actionVal === (row.nextAction || "")) return;
    try {
      // só o campo operacional: não confirma a classificação sugerida
      await salvarRc(row.rc, { nextAction: actionVal.trim() || null, targets, sourceValue: row.value } as unknown as RcCurationUpsertRequest);
    } catch (e: any) { alert(e.message); }
  };

  const togglePriority = async () => {
    try {
      // só o campo operacional: não confirma a classificação sugerida
      await salvarRc(row.rc, { priority: row.priority === "ALTA" ? null : "ALTA", targets, sourceValue: row.value } as unknown as RcCurationUpsertRequest);
    } catch (e: any) { alert(e.message); }
  };

  const renderBtn = (estado: string, label: string) => {
    const isActive = activeClass === estado;
    const isSuggested = suggestedClass === estado && !isConfirmed;
    let cls = "px-1.5 py-1 text-[10px] whitespace-nowrap font-medium rounded transition-colors ";
    
    if (isActive && isConfirmed) {
      cls += "bg-accent text-accent-fg border border-accent ";
    } else if (isSuggested) {
      cls += "border border-dashed border-border bg-muted/30 text-text-muted hover:border-text-muted ";
    } else {
      cls += "bg-card border border-border text-text hover:bg-muted ";
    }

    return (
      <button 
        key={estado}
        className={cls}
        onClick={() => {
          if (estado === "NAO_OCORRE") setPopoverOpen(!popoverOpen);
          else handleClassify(estado as any);
        }}
      >
        {label}
        {isSuggested && <span className="block text-[8px] opacity-70">Sugerido</span>}
      </button>
    );
  };

  return (
    <>
      <tr className="hover:bg-muted/50 transition-colors">
        <td className="p-2 whitespace-nowrap">
          <div className="flex items-center gap-1 font-semibold">
            <button onClick={togglePriority} className={`p-0.5 rounded ${row.priority === "ALTA" ? "text-accent" : "text-text-muted hover:text-text"}`}>
              <Star size={14} className={row.priority === "ALTA" ? "fill-current" : ""} />
            </button>
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
          <div className="text-text-muted text-[11px] truncate">{row.supplier || "-"}</div>
        </td>
        <td className="p-2 text-right font-medium whitespace-nowrap">{fmtBRL(row.value)}</td>
        <td className="p-2">
          <div className="inline-flex items-center font-medium px-2 py-0.5 rounded bg-muted text-text cursor-help" title={`Status RC: ${row.tooltip.statusRc || "—"}\nStatus compromisso: ${row.tooltip.statusCompromisso || "—"}\nOC: ${row.tooltip.oc || "—"}\nComprador: ${row.tooltip.comprador || "—"}\nData prometida: ${fmtDate(row.tooltip.dataPrometida)}`}>
            {row.stage} · {STAGE_LABELS[row.stage] ?? row.stage}
          </div>
          <div className="mt-0.5 text-[11px] text-text-muted truncate" title={row.owner}>{row.owner || "—"}</div>
        </td>
        <td className="p-2 text-right whitespace-nowrap" title={row.stage === "E4" ? "E4: dias de atraso" : "Dias na etapa"}>
          {row.daysInStage == null ? "—" : row.stage === "E4" ? (row.daysInStage < 0 ? `faltam ${-row.daysInStage}` : `${row.daysInStage} atraso`) : row.daysInStage}
        </td>
        <td className="p-2 whitespace-nowrap text-text text-xs">
          {editingDelivery !== null ? (
            <input 
              ref={deliveryInputRef}
              type="date" 
              className="border border-border bg-card text-text rounded px-1 py-0.5 w-28 text-xs" 
              value={editingDelivery} 
              onChange={e => setEditingDelivery(e.target.value)} 
              onBlur={saveDelivery}
              onKeyDown={e => e.key === "Enter" && saveDelivery()}
            />
          ) : (
            <div 
              className={`cursor-pointer hover:underline ${!isConfirmed ? 'text-text-muted' : ''}`} 
              onClick={() => { if (activeClass !== "NAO_OCORRE" && row.stage !== "E5" && row.stage !== "E6") setEditingDelivery(deliveryDateDisplayed || "") }}
              title="Entrega esperada"
            >
              {row.stage === "E5" || row.stage === "E6" ? "Recebido" : fmtDate(deliveryDateDisplayed)}
            </div>
          )}
        </td>
        <td className="p-2">
          <div className="flex items-center gap-1">
            {editingAction ? (
              <input 
                ref={actionInputRef}
                type="text" 
                maxLength={80} 
                className="border border-border bg-card text-text rounded px-1 py-0.5 w-full text-xs" 
                value={actionVal} 
                onChange={e => setActionVal(e.target.value)}
                onBlur={saveAction}
                onKeyDown={e => e.key === "Enter" && saveAction()}
              />
            ) : (
              <>
                <div className="truncate text-xs flex-1" title={row.nextAction || undefined}>{row.nextAction || "-"}</div>
                <button onClick={() => setEditingAction(true)} className="text-text-muted hover:text-text p-1"><Edit2 size={12} /></button>
              </>
            )}
          </div>
        </td>
        <td className="p-2 relative">
          <div className="flex flex-nowrap gap-1">
            {renderBtn("CAIXA_26", "Caixa 26")}
            {renderBtn("EM_RISCO", "Em risco")}
            {renderBtn("CAIXA_27", "Caixa 27")}
            {renderBtn("NAO_OCORRE", "Não ocorre")}
          </div>
          {popoverOpen && (
            <div className="absolute right-0 top-full mt-1 z-10 w-48 bg-card border border-border shadow-lg rounded p-2">
              <div className="text-[10px] font-bold mb-2">Motivo</div>
              <div className="space-y-1">
                {NON_OCCURRENCE_REASONS.filter(r => r !== 'LEGADO').map(r => (
                  <button 
                    key={r} 
                    className="block w-full text-left px-2 py-1 text-xs hover:bg-muted rounded"
                    onClick={() => handleClassify("NAO_OCORRE", r)}
                  >
                    {ENUM_LABELS[r] ?? r}
                  </button>
                ))}
              </div>
            </div>
          )}
          {erroDe(`rc:${row.rc}`) && <div className="text-[10px] text-risk-critico mt-1">{erroDe(`rc:${row.rc}`)}</div>}
        </td>
      </tr>
    </>
  );
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
          <div className="font-bold">Não confirmadas</div>
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

      <div className="overflow-x-auto overflow-y-visible rounded border border-border pb-32">
        <table className="w-full table-fixed text-left text-xs text-text border-collapse">
          <colgroup>
            <col className="w-[150px]" />
            <col />
            <col className="w-[100px]" />
            <col className="w-[170px]" />
            <col className="w-[70px]" />
            <col className="w-[90px]" />
            <col className="w-[150px]" />
            <col className="w-[300px]" />
          </colgroup>
          <thead className="bg-muted text-text-muted border-b border-border">
            <tr>
              <th className="p-2 font-medium whitespace-nowrap">RC</th>
              <th className="p-2 font-medium">Projeto / Fornecedor</th>
              <th className="p-2 font-medium text-right">Valor</th>
              <th className="p-2 font-medium">Etapa</th>
              <th className="p-2 font-medium text-right">Dias</th>
              <th className="p-2 font-medium">Entrega esperada</th>
              <th className="p-2 font-medium">Próxima ação</th>
              <th className="p-2 font-medium">Previsão caixa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {displayRows.map((row) => (
              <RcRowOperational key={row.rc} row={row} exerciseYear={bundle.exerciseYear} bundle={bundle} curationMap={curationMap} salvarRc={salvarRc} erroDe={erroDe} />
            ))}
            {displayRows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-text-muted">
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
