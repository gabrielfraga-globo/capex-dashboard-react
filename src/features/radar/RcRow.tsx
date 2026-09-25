import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { InfoTooltip } from "../../components/ui/primitives";
import { cn } from "../../lib/utils";
import { fmtBRL } from "../../lib/format";
import { aplicarMascaraData, isoParaMascara, mascaraParaIso } from "./dateMask";
import type {
  CommitmentCuration,
  CommitmentView,
  CurationUpsertRequest,
  PoStatus,
  RcCurationUpsertRequest,
  RcCurationUpsertResponse,
  RcView,
} from "./types";
import { derivarPoStatus } from "./types";
import { fornecedorDoCompromisso, fornecedoresDaRc } from "./suppliers";
import { poStatusLabel } from "./status";
import { COMMITMENT_TABLE_WIDTH, CommitmentColGroup, OverflowText } from "./tableLayout";
import { useOverflowTitle } from "./useOverflowTitle";

const STATUS_BADGE: Record<PoStatus, string> = {
  CONFIRMED: "bg-emerald-700 text-white",
  AT_RISK: "bg-amber-700 text-white",
  CARRYOVER: "bg-sky-700 text-white",
  CANCELLED: "bg-red-700 text-white",
  NO_VISIBILITY: "bg-slate-600 text-white",
};

const HETEROGENEITY_LABEL: Record<string, string> = {
  multiplos_projetos: "múltiplos projetos",
  multiplas_ocs: "múltiplas OCs",
  multiplos_fornecedores: "múltiplos fornecedores",
  status_divergente: "status divergente",
  datas_divergentes: "datas divergentes",
  divide_exercicio: "cruza o exercício",
};

interface Draft {
  dataMasked: string;
  nota: string;
}

function draftDeCuradoria(cur: CommitmentCuration | null): Draft {
  return {
    dataMasked: isoParaMascara(cur?.estimatedDeliveryDate ?? null),
    nota: cur?.notes ?? "",
  };
}

function draftsIguais(a: Draft, b: Draft): boolean {
  return a.dataMasked === b.dataMasked && a.nota === b.nota;
}

function dataRetroativa(masked: string): boolean {
  const iso = mascaraParaIso(masked);
  if (!iso) return false;
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const hoje = new Date();
  const hojeUtc = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
  return data < hojeUtc;
}

export function precisaAtencao(rc: RcView): boolean {
  return rc.commitments.some((c) => !c.isCurated || c.requiresReview || c.isStale);
}

interface RcRowProps {
  rcView: RcView;
  isSavingRc: boolean;
  errorRc: string | null;
  isSavingChave: (chave: string) => boolean;
  erroDaChave: (chave: string) => string | null;
  onSalvarRc: (rc: string, payload: RcCurationUpsertRequest) => Promise<RcCurationUpsertResponse | null>;
  onSalvarChave: (chave: string, payload: CurationUpsertRequest) => Promise<boolean>;
  onEnterProximaRc: (rcAtual: string) => void;
  exerciseYear: number;
}

export function RcRow({
  rcView,
  isSavingRc,
  errorRc,
  isSavingChave,
  erroDaChave,
  onSalvarRc,
  onSalvarChave,
  onEnterProximaRc,
  exerciseYear,
}: RcRowProps) {
  const linhaRef = useRef<HTMLTableRowElement>(null);
  const dataInputRef = useRef<HTMLInputElement>(null);
  const calendarInputRef = useRef<HTMLInputElement>(null);
  const [expandido, setExpandido] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftDeCuradoria(rcView.effectiveCuration));
  const [preservadas, setPreservadas] = useState<number | null>(null);
  const salvoRef = useRef<Draft>(draft);

  // Re-sincroniza o rascunho com o servidor quando não há foco ativo na linha
  // (evita apagar o que o gestor está digitando enquanto o refetch acontece).
  useEffect(() => {
    const focado = linhaRef.current?.contains(document.activeElement) ?? false;
    if (!focado) {
      const novo = draftDeCuradoria(rcView.effectiveCuration);
      setDraft(novo);
      salvoRef.current = novo;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rcView.effectiveCuration?.updatedAt, rcView.hasMixedCuration]);

  useEffect(() => {
    if (preservadas === null) return;
    const timer = setTimeout(() => setPreservadas(null), 5000);
    return () => clearTimeout(timer);
  }, [preservadas]);

  const temFilhosVisiveis = rcView.isHeterogeneous;
  const requerRevisao = rcView.commitments.some((c) => c.requiresReview);
  const chaveUnica = rcView.commitments.length === 1 ? rcView.commitments[0].commitmentKey : null;
  const statusAtual = rcView.effectiveCuration?.poStatus ?? rcView.commitments[0]?.curation?.poStatus ?? null;

  async function salvarSeMudou() {
    if (draftsIguais(draft, salvoRef.current)) return;

    let iso: string | null = null;
    if (draft.dataMasked !== "") {
      iso = mascaraParaIso(draft.dataMasked);
      if (iso === null) return; // data incompleta/ inválida — não grava ainda
    }

    const antes = { ...salvoRef.current };

    if (chaveUnica) {
      const ok = await onSalvarChave(chaveUnica, {
        estimatedDeliveryDate: iso,
        poStatus: statusAtual === "CANCELLED" ? "CANCELLED" : derivarPoStatus(iso, exerciseYear),
        notes: draft.nota || null,
        sourceValue: rcView.commitments[0].sourceValue,
      });
      if (!ok) {
        setDraft(antes);
        salvoRef.current = antes;
      } else {
        salvoRef.current = draft;
      }
      return;
    }

    const resposta = await onSalvarRc(rcView.rc, {
      estimatedDeliveryDate: iso,
      poStatus: statusAtual === "CANCELLED" ? "CANCELLED" : derivarPoStatus(iso, exerciseYear),
      notes: draft.nota || null,
      sourceValue: rcView.totalValue,
      targets: rcView.commitments.map((c) => ({ commitmentKey: c.commitmentKey, sourceValue: c.sourceValue })),
    });
    if (!resposta) {
      setDraft(antes);
      salvoRef.current = antes;
      return;
    }
    salvoRef.current = draft;
    if (resposta.preserved.length > 0) setPreservadas(resposta.preserved.length);
  }

  function aoTeclarEnter() {
    void salvarSeMudou();
    onEnterProximaRc(rcView.rc);
  }

  async function alternarCancelamento() {
    const iso = draft.dataMasked === "" ? null : mascaraParaIso(draft.dataMasked);
    if (draft.dataMasked !== "" && !iso) return;
    const poStatus = statusAtual === "CANCELLED" ? derivarPoStatus(iso, exerciseYear) : "CANCELLED";
    const payload = { estimatedDeliveryDate: iso, poStatus, notes: draft.nota || null };
    if (chaveUnica) {
      await onSalvarChave(chaveUnica, { ...payload, sourceValue: rcView.commitments[0].sourceValue });
    } else {
      await onSalvarRc(rcView.rc, {
        ...payload,
        sourceValue: rcView.totalValue,
        targets: rcView.commitments.map((c) => ({ commitmentKey: c.commitmentKey, sourceValue: c.sourceValue })),
      });
    }
  }

  function abrirCalendario() {
    const input = calendarInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") input.showPicker();
    else input.click();
  }

  const salvando = chaveUnica ? isSavingChave(chaveUnica) : isSavingRc;
  const erro = chaveUnica ? erroDaChave(chaveUnica) : errorRc;
  const dataNoPassado = draft.dataMasked !== "" && dataRetroativa(draft.dataMasked);
  const fornecedores = fornecedoresDaRc(rcView);
  const fornecedor = fornecedores.length === 1 ? fornecedores[0] : `${fornecedores.length} fornecedores`;
  const quantidade = rcView.commitments.reduce((total, commitment) => total + commitment.lineCount, 0);
  const ordensCompra = Array.from(new Set(rcView.commitments.map((commitment) => commitment.oc)));
  const statusesCompromisso = Array.from(new Set(rcView.commitments.map((commitment) => commitment.systemStatus).filter(Boolean)));
  const descricoes = Array.from(new Set(rcView.commitments.map((commitment) => commitment.requestDescription?.trim()).filter((value): value is string => Boolean(value))));
  const ordemCompra = ordensCompra.length === 1 ? (ordensCompra[0] === "PENDING" ? "—" : ordensCompra[0]) : `${ordensCompra.length} OCs`;
  const statusCompromisso = statusesCompromisso.length <= 1 ? (statusesCompromisso[0] ?? "—") : `${statusesCompromisso.length} status`;
  const pagamento = rcView.commitments[0]?.expectedPaymentDate;
  const pagamentoFormatado = pagamento ? isoParaMascara(pagamento) : "—";
  const noteOverflow = useOverflowTitle<HTMLInputElement>(draft.nota);
  const resumoRc = [rcView.rc, ...rcView.heterogeneityReasons.map((reason) => HETEROGENEITY_LABEL[reason] ?? reason)].join(" · ");

  return (
    <>
      <tr
        ref={linhaRef}
        data-rc-key={rcView.rc}
        className={cn("commitment-data-row border-b border-border/60 text-xs", requerRevisao && "commitment-review-row")}
      >
        <td className="py-1.5 pr-2">
          <OverflowText text={resumoRc} className="flex items-center gap-1">
            {temFilhosVisiveis ? (
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setExpandido((v) => !v)}
                className="text-text-muted hover:text-text shrink-0"
                aria-label={expandido ? "Recolher RC" : "Expandir RC"}
                aria-expanded={expandido}
              >
                {expandido ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
            ) : (
              <span className="w-[13px] shrink-0" />
            )}
            <span className="font-mono">{rcView.rc}</span>
            {descricoes.length > 0 && (
              <span title={descricoes.join("\n")}>
                <InfoTooltip text={descricoes.join("\n")} />
              </span>
            )}
            {requerRevisao && <span className="text-[10px] font-bold text-risk-revisao">revisar</span>}
            {temFilhosVisiveis && rcView.heterogeneityReasons.length > 0 && (
              <span className="text-[10px] text-text-faint">
              {rcView.heterogeneityReasons.map((r) => HETEROGENEITY_LABEL[r] ?? r).join(", ")}
              </span>
            )}
          </OverflowText>
        </td>
        <td className="py-1.5 pr-2">
          <OverflowText text={fornecedores.join("\n")}>{fornecedor}</OverflowText>
        </td>
        <td className="py-1.5 pr-2">
          <OverflowText text={ordensCompra.join("\n")}>{ordemCompra}</OverflowText>
        </td>
        <td className="py-1.5 pr-2">
          <OverflowText text={statusesCompromisso.join("\n") || "—"}>{statusCompromisso}</OverflowText>
        </td>
        <td className="py-1.5 pr-2 text-right"><OverflowText text={fmtBRL(rcView.totalValue)}>{fmtBRL(rcView.totalValue)}</OverflowText></td>
        <td className="py-1.5 pr-2 text-right"><OverflowText text={String(quantidade)}>{quantidade}</OverflowText></td>
        <td className="py-1.5 pr-2">
          <div className="relative">
            <input
              ref={dataInputRef}
              data-role="date-input"
              type="text"
              inputMode="numeric"
              placeholder="dd/mm/aa"
              value={draft.dataMasked}
              onChange={(e) => setDraft((prev) => ({ ...prev, dataMasked: aplicarMascaraData(e.target.value) }))}
              onBlur={() => void salvarSeMudou()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  aoTeclarEnter();
                }
              }}
              className={cn(
                "w-[72px] rounded border border-border bg-card px-1.5 py-1 text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
                draft.dataMasked !== "" && mascaraParaIso(draft.dataMasked) === null && draft.dataMasked.length === 8 && "border-risk-critico"
              )}
              title={dataNoPassado ? "Data anterior a hoje; confirme se a entrega já ocorreu." : undefined}
            />
            <button type="button" className="ml-1 text-text-muted hover:text-text" aria-label="Abrir calendário" onClick={abrirCalendario}>
              <Calendar size={14} />
            </button>
            <input
              ref={calendarInputRef}
              type="date"
              tabIndex={-1}
              aria-hidden="true"
              className="absolute h-0 w-0 opacity-0"
              value={mascaraParaIso(draft.dataMasked) ?? ""}
              onChange={(e) => setDraft((prev) => ({ ...prev, dataMasked: isoParaMascara(e.target.value) }))}
              onBlur={() => void salvarSeMudou()}
            />
            {dataNoPassado && (
              <div className="mt-1 text-[9px] text-amber-600" title="Data anterior a hoje; confirme se a entrega já ocorreu.">
                data retroativa
              </div>
            )}
          </div>
        </td>
        <td className="py-1.5 pr-2 text-text-muted">
          <OverflowText text={pagamentoFormatado}>{pagamentoFormatado}</OverflowText>
        </td>
        <td className="py-1.5 pr-2">
          <OverflowText text={statusAtual ? poStatusLabel(statusAtual, exerciseYear) : "—"}>
            {statusAtual ? <span className={cn("inline-flex rounded px-1.5 py-1 font-semibold", STATUS_BADGE[statusAtual])}>{poStatusLabel(statusAtual, exerciseYear)}</span> : "—"}
          </OverflowText>
        </td>
        <td className="py-1.5 pr-2">
          <input
            ref={noteOverflow.ref}
            type="text"
            maxLength={2000}
            placeholder="nota"
            value={draft.nota}
            onChange={(e) => setDraft((prev) => ({ ...prev, nota: e.target.value }))}
            onBlur={() => void salvarSeMudou()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                aoTeclarEnter();
              }
            }}
            title={noteOverflow.title}
            className="w-full min-w-[90px] rounded border border-border bg-card px-1.5 py-1 text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          />
        </td>
        <td className="py-1.5 pr-1">
          <OverflowText text={statusAtual === "CANCELLED" ? "reverter" : "não contabilizar"} className="flex items-center">
            {statusAtual && (
              <button
                type="button"
                disabled={salvando}
                onClick={() => void alternarCancelamento()}
                className="mr-2 whitespace-nowrap text-[10px] text-text-muted hover:text-text"
              >
                {statusAtual === "CANCELLED" ? "reverter" : "não contabilizar"}
              </button>
            )}
            {salvando && <Loader2 size={12} className="shrink-0 animate-spin text-text-faint" aria-label="Salvando…" />}
            {!salvando && erro && (
              <span className="text-risk-critico" title={erro}>
                !
              </span>
            )}
            {!salvando && !erro && preservadas !== null && (
              <span className="text-[10px] text-text-faint whitespace-nowrap">{preservadas} preservada(s)</span>
            )}
          </OverflowText>
        </td>
      </tr>

      {chaveUnica && rcView.commitments[0].isStale && (
        <tr className="commitment-message-row text-[10px] text-risk-medio">
          <td colSpan={11} className="pb-1.5 pl-6">
            valor mudou: {fmtBRL(rcView.commitments[0].curation?.sourceValueAtCuration)} → {fmtBRL(rcView.commitments[0].sourceValue)}
            {" · "}
            <button
              type="button"
              className="underline"
              onClick={() =>
                void onSalvarChave(rcView.commitments[0].commitmentKey, {
                  estimatedDeliveryDate: rcView.commitments[0].curation?.estimatedDeliveryDate ?? null,
                  poStatus:
                    rcView.commitments[0].curation?.poStatus === "CANCELLED"
                      ? "CANCELLED"
                      : derivarPoStatus(rcView.commitments[0].curation?.estimatedDeliveryDate ?? null, exerciseYear),
                  notes: rcView.commitments[0].curation?.notes ?? null,
                  sourceValue: rcView.commitments[0].sourceValue,
                })
              }
            >
              atualizar valor
            </button>
          </td>
        </tr>
      )}

      {expandido && temFilhosVisiveis && (
        <tr className="commitment-detail-row">
          <td colSpan={11} className="pb-2">
            <table className="commitment-child-table commitment-grid table-fixed border-collapse text-[11px]" style={{ width: COMMITMENT_TABLE_WIDTH }}>
              <CommitmentColGroup />
              <tbody>
                {rcView.commitments.map((c) => (
                  <ChildRow key={c.commitmentKey} view={c} exerciseYear={exerciseYear} onSalvarChave={onSalvarChave} isSaving={isSavingChave(c.commitmentKey)} erro={erroDaChave(c.commitmentKey)} />
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

function ChildRow({
  view,
  exerciseYear,
  onSalvarChave,
  isSaving,
  erro,
}: {
  view: CommitmentView;
  exerciseYear: number;
  onSalvarChave: (chave: string, payload: CurationUpsertRequest) => Promise<boolean>;
  isSaving: boolean;
  erro: string | null;
}) {
  const linhaRef = useRef<HTMLTableRowElement>(null);
  const calendarInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft>(() => draftDeCuradoria(view.curation));
  const salvoRef = useRef<Draft>(draft);
  const dataNoPassado = draft.dataMasked !== "" && dataRetroativa(draft.dataMasked);

  useEffect(() => {
    const focado = linhaRef.current?.contains(document.activeElement) ?? false;
    if (!focado) {
      const novo = draftDeCuradoria(view.curation);
      setDraft(novo);
      salvoRef.current = novo;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.curation?.updatedAt]);

  async function salvarSeMudou() {
    if (draftsIguais(draft, salvoRef.current)) return;
    let iso: string | null = null;
    if (draft.dataMasked !== "") {
      iso = mascaraParaIso(draft.dataMasked);
      if (iso === null) return;
    }
    const antes = { ...salvoRef.current };
    const ok = await onSalvarChave(view.commitmentKey, {
      estimatedDeliveryDate: iso,
      poStatus: view.curation?.poStatus === "CANCELLED" ? "CANCELLED" : derivarPoStatus(iso, exerciseYear),
      notes: draft.nota || null,
      sourceValue: view.sourceValue,
    });
    if (!ok) {
      setDraft(antes);
      salvoRef.current = antes;
      return;
    }
    salvoRef.current = draft;
  }

  async function alternarCancelamento() {
    const iso = draft.dataMasked === "" ? null : mascaraParaIso(draft.dataMasked);
    if (draft.dataMasked !== "" && !iso) return;
    await onSalvarChave(view.commitmentKey, {
      estimatedDeliveryDate: iso,
      poStatus: view.curation?.poStatus === "CANCELLED" ? derivarPoStatus(iso, exerciseYear) : "CANCELLED",
      notes: draft.nota || null,
      sourceValue: view.sourceValue,
    });
  }

  function abrirCalendario() {
    const input = calendarInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") input.showPicker();
    else input.click();
  }

  const fornecedor = fornecedorDoCompromisso(view);
  const ordemCompra = view.oc === "PENDING" ? "—" : view.oc;
  const statusCompromisso = view.systemStatus || "—";
  const pagamento = view.expectedPaymentDate ? isoParaMascara(view.expectedPaymentDate) : "—";
  const status = view.curation ? poStatusLabel(view.curation.poStatus, exerciseYear) : "—";
  const origemCuradoria = view.curation?.curationLevel === "KEY" ? "própria" : "herdada da RC";

  return (
    <tr ref={linhaRef} className={cn("commitment-child-row border-b border-border/40", view.requiresReview && "commitment-review-row")}>
      <td className="py-1 pr-2 text-text-muted">
        <OverflowText text={`PPM ${view.projectId}`}>PPM {view.projectId}</OverflowText>
      </td>
      <td className="py-1 pr-2 text-text-muted"><OverflowText text={fornecedor}>{fornecedor}</OverflowText></td>
      <td className="py-1 pr-2 text-text-muted"><OverflowText text={ordemCompra}>{ordemCompra}</OverflowText></td>
      <td className="py-1 pr-2 text-text-muted"><OverflowText text={statusCompromisso}>{statusCompromisso}</OverflowText></td>
      <td className="py-1 pr-2 text-right"><OverflowText text={fmtBRL(view.sourceValue)}>{fmtBRL(view.sourceValue)}</OverflowText></td>
      <td className="py-1 pr-2 text-right"><OverflowText text={String(view.lineCount)}>{view.lineCount}</OverflowText></td>
      <td className="py-1 pr-2">
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            placeholder="dd/mm/aa"
            value={draft.dataMasked}
            onChange={(e) => setDraft((prev) => ({ ...prev, dataMasked: aplicarMascaraData(e.target.value) }))}
            onBlur={() => void salvarSeMudou()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            className={cn(
              "w-[68px] rounded border border-border bg-card px-1 py-0.5 text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
              draft.dataMasked !== "" && mascaraParaIso(draft.dataMasked) === null && draft.dataMasked.length === 8 && "border-risk-critico"
            )}
            title={dataNoPassado ? "Data anterior a hoje; confirme se a entrega já ocorreu." : undefined}
          />
          <button type="button" className="ml-1 text-text-muted hover:text-text" aria-label="Abrir calendário" onClick={abrirCalendario}>
            <Calendar size={13} />
          </button>
          <input
            ref={calendarInputRef}
            type="date"
            tabIndex={-1}
            aria-hidden="true"
            className="absolute h-0 w-0 opacity-0"
            value={mascaraParaIso(draft.dataMasked) ?? ""}
            onChange={(e) => setDraft((prev) => ({ ...prev, dataMasked: isoParaMascara(e.target.value) }))}
            onBlur={() => void salvarSeMudou()}
          />
          {dataNoPassado && (
            <div className="mt-1 text-[9px] text-amber-600" title="Data anterior a hoje; confirme se a entrega já ocorreu.">
              data retroativa
            </div>
          )}
        </div>
      </td>
      <td className="py-1 pr-2 text-text-muted">
        <OverflowText text={pagamento}>{pagamento}</OverflowText>
      </td>
      <td className="py-1 pr-2">
        <OverflowText text={status}>
          {view.curation ? (
            <span className={cn("inline-flex rounded px-1 py-0.5 font-semibold", STATUS_BADGE[view.curation.poStatus])}>
              {status}
            </span>
          ) : "—"}
        </OverflowText>
      </td>
      <td className="py-1 pr-2">
        <OverflowText text={view.isStale ? `${origemCuradoria}; valor mudou: ${fmtBRL(view.curation?.sourceValueAtCuration)} → ${fmtBRL(view.sourceValue)}` : origemCuradoria}>
          <span className="text-[10px] text-text-faint">{origemCuradoria}</span>
        {view.isStale && (
          <span className="ml-1 text-risk-medio">
            valor mudou: {fmtBRL(view.curation?.sourceValueAtCuration)} → {fmtBRL(view.sourceValue)}
          </span>
        )}
        </OverflowText>
      </td>
      <td className="py-1 pr-1">
        <OverflowText text={`${view.curation?.poStatus === "CANCELLED" ? "reverter" : "não contabilizar"}${view.requiresReview ? "; revisar" : ""}`} className="flex items-center">
          {view.curation && (
            <button type="button" disabled={isSaving} className="mr-2 text-[10px] text-text-muted hover:text-text" onClick={() => void alternarCancelamento()}>
              {view.curation.poStatus === "CANCELLED" ? "reverter" : "não contabilizar"}
            </button>
          )}
          {view.requiresReview && (
            <button
              type="button"
              disabled={isSaving}
              className="underline text-risk-revisao"
              onClick={() =>
                void onSalvarChave(view.commitmentKey, {
                  estimatedDeliveryDate: view.curation?.estimatedDeliveryDate ?? null,
                  poStatus:
                    view.curation?.poStatus === "CANCELLED"
                      ? "CANCELLED"
                      : derivarPoStatus(view.curation?.estimatedDeliveryDate ?? null, exerciseYear),
                  notes: view.curation?.notes ?? null,
                  sourceValue: view.sourceValue,
                })
              }
            >
              revisar
            </button>
          )}
          {isSaving && <Loader2 size={11} className="ml-1 shrink-0 animate-spin text-text-faint" />}
          {erro && (
            <span className="text-risk-critico ml-1" title={erro}>
              !
            </span>
          )}
        </OverflowText>
      </td>
    </tr>
  );
}
