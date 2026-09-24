import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
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

const STATUS_OPTIONS: { value: PoStatus; label: string }[] = [
  { value: "CONFIRMED", label: "C · Confirmado" },
  { value: "AT_RISK", label: "A · Em risco" },
  { value: "NO_VISIBILITY", label: "N · Sem visibilidade" },
  { value: "CANCELLED", label: "X · Cancelado" },
];

const STATUS_BADGE: Record<PoStatus, string> = {
  CONFIRMED: "bg-risk-baixo text-emerald-950",
  AT_RISK: "bg-risk-alto text-white",
  CANCELLED: "bg-slate-500 text-white",
  NO_VISIBILITY: "bg-risk-medio text-black",
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
  status: PoStatus | "";
  nota: string;
}

function draftDeCuradoria(cur: CommitmentCuration | null): Draft {
  return {
    dataMasked: isoParaMascara(cur?.estimatedDeliveryDate ?? null),
    status: cur?.poStatus ?? "",
    nota: cur?.notes ?? "",
  };
}

function draftsIguais(a: Draft, b: Draft): boolean {
  return a.dataMasked === b.dataMasked && a.status === b.status && a.nota === b.nota;
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
}: RcRowProps) {
  const linhaRef = useRef<HTMLTableRowElement>(null);
  const dataInputRef = useRef<HTMLInputElement>(null);
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

  async function salvarSeMudou() {
    if (draftsIguais(draft, salvoRef.current)) return;
    if (draft.status === "") return; // status é obrigatório para gravar

    let iso: string | null = null;
    if (draft.dataMasked !== "") {
      iso = mascaraParaIso(draft.dataMasked);
      if (iso === null) return; // data incompleta/ inválida — não grava ainda
    }

    const antes = { ...salvoRef.current };

    if (chaveUnica) {
      const ok = await onSalvarChave(chaveUnica, {
        estimatedDeliveryDate: iso,
        poStatus: draft.status,
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
      poStatus: draft.status,
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

  function aoMudarStatus(novo: PoStatus) {
    setDraft((prev) => ({ ...prev, status: novo }));
    if (novo === "CONFIRMED" && draft.dataMasked === "") {
      requestAnimationFrame(() => dataInputRef.current?.focus());
    }
  }

  const salvando = chaveUnica ? isSavingChave(chaveUnica) : isSavingRc;
  const erro = chaveUnica ? erroDaChave(chaveUnica) : errorRc;
  const dataNoPassado = draft.dataMasked !== "" && dataRetroativa(draft.dataMasked);

  return (
    <>
      <tr
        ref={linhaRef}
        data-rc-key={rcView.rc}
        className={cn("border-b border-border/60 text-xs", requerRevisao && "bg-risk-revisao/10")}
      >
        <td className="py-1.5 pr-2 whitespace-nowrap">
          <div className="flex items-center gap-1">
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
            {requerRevisao && <span className="text-[10px] font-bold text-risk-revisao">revisar</span>}
          </div>
          {temFilhosVisiveis && rcView.heterogeneityReasons.length > 0 && (
            <div className="pl-[17px] text-[10px] text-text-faint">
              {rcView.heterogeneityReasons.map((r) => HETEROGENEITY_LABEL[r] ?? r).join(", ")}
            </div>
          )}
        </td>
        <td className="py-1.5 pr-2 text-right whitespace-nowrap">{fmtBRL(rcView.totalValue)}</td>
        <td className="py-1.5 pr-2">
          <div>
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
            {dataNoPassado && (
              <div className="mt-1 text-[9px] text-amber-600" title="Data anterior a hoje; confirme se a entrega já ocorreu.">
                data retroativa
              </div>
            )}
          </div>
        </td>
        <td className="py-1.5 pr-2 whitespace-nowrap text-text-muted">
          {(() => {
            const pagamento = rcView.commitments[0]?.expectedPaymentDate;
            return pagamento ? isoParaMascara(pagamento) : "—";
          })()}
        </td>
        <td className="py-1.5 pr-2">
          <select
            value={draft.status}
            onChange={(e) => aoMudarStatus(e.target.value as PoStatus)}
            onBlur={() => void salvarSeMudou()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                aoTeclarEnter();
              }
            }}
            className={cn(
              "rounded border border-border bg-card px-1.5 py-1 text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
              draft.status && STATUS_BADGE[draft.status]
            )}
          >
            <option value="" disabled>
              Selecionar…
            </option>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </td>
        <td className="py-1.5 pr-2">
          <input
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
            className="w-full min-w-[90px] rounded border border-border bg-card px-1.5 py-1 text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          />
        </td>
        <td className="py-1.5 pr-1 w-5">
          {salvando && <Loader2 size={12} className="animate-spin text-text-faint" aria-label="Salvando…" />}
          {!salvando && erro && (
            <span className="text-risk-critico" title={erro}>
              !
            </span>
          )}
          {!salvando && !erro && preservadas !== null && (
            <span className="text-[10px] text-text-faint whitespace-nowrap">{preservadas} preservada(s)</span>
          )}
        </td>
      </tr>

      {chaveUnica && rcView.commitments[0].isStale && (
        <tr className="text-[10px] text-risk-medio">
          <td colSpan={7} className="pb-1.5 pl-6">
            valor mudou: {fmtBRL(rcView.commitments[0].curation?.sourceValueAtCuration)} → {fmtBRL(rcView.commitments[0].sourceValue)}
            {" · "}
            <button
              type="button"
              className="underline"
              onClick={() =>
                void onSalvarChave(rcView.commitments[0].commitmentKey, {
                  estimatedDeliveryDate: rcView.commitments[0].curation?.estimatedDeliveryDate ?? null,
                  poStatus: rcView.commitments[0].curation?.poStatus ?? "AT_RISK",
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
        <tr>
          <td colSpan={7} className="pb-2 pl-6 pr-2">
            <table className="w-full text-[11px] border-collapse">
              <tbody>
                {rcView.commitments.map((c) => (
                  <ChildRow key={c.commitmentKey} view={c} onSalvarChave={onSalvarChave} isSaving={isSavingChave(c.commitmentKey)} erro={erroDaChave(c.commitmentKey)} />
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
  onSalvarChave,
  isSaving,
  erro,
}: {
  view: CommitmentView;
  onSalvarChave: (chave: string, payload: CurationUpsertRequest) => Promise<boolean>;
  isSaving: boolean;
  erro: string | null;
}) {
  const linhaRef = useRef<HTMLTableRowElement>(null);
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
    if (draft.status === "") return;
    let iso: string | null = null;
    if (draft.dataMasked !== "") {
      iso = mascaraParaIso(draft.dataMasked);
      if (iso === null) return;
    }
    const antes = { ...salvoRef.current };
    const ok = await onSalvarChave(view.commitmentKey, {
      estimatedDeliveryDate: iso,
      poStatus: draft.status,
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

  return (
    <tr ref={linhaRef} className={cn("border-b border-border/40", view.requiresReview && "bg-risk-revisao/10")}>
      <td className="py-1 pr-2 text-text-muted whitespace-nowrap">
        PPM {view.projectId} · OC {view.oc === "PENDING" ? "—" : view.oc}
      </td>
      <td className="py-1 pr-2 text-text-muted">{view.projectName}</td>
      <td className="py-1 pr-2 text-right whitespace-nowrap">{fmtBRL(view.sourceValue)}</td>
      <td className="py-1 pr-2">
        <div>
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
          {dataNoPassado && (
            <div className="mt-1 text-[9px] text-amber-600" title="Data anterior a hoje; confirme se a entrega já ocorreu.">
              data retroativa
            </div>
          )}
        </div>
      </td>
      <td className="py-1 pr-2">
        <select
          value={draft.status}
          onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value as PoStatus }))}
          onBlur={() => void salvarSeMudou()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLSelectElement).blur();
            }
          }}
          className={cn(
            "rounded border border-border bg-card px-1 py-0.5 text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
            draft.status && STATUS_BADGE[draft.status]
          )}
        >
          <option value="" disabled>
            Selecionar…
          </option>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </td>
      <td className="py-1 pr-2 whitespace-nowrap">
        {view.curation?.curationLevel === "KEY" ? (
          <span className="text-[10px] text-text-faint">própria</span>
        ) : (
          <span className="text-[10px] text-text-faint">herdada da RC</span>
        )}
        {view.isStale && (
          <span className="block text-risk-medio">
            valor mudou: {fmtBRL(view.curation?.sourceValueAtCuration)} → {fmtBRL(view.sourceValue)}
          </span>
        )}
      </td>
      <td className="py-1 pr-1 whitespace-nowrap">
        {view.requiresReview && (
          <button
            type="button"
            disabled={isSaving}
            className="underline text-risk-revisao"
            onClick={() =>
              void onSalvarChave(view.commitmentKey, {
                estimatedDeliveryDate: view.curation?.estimatedDeliveryDate ?? null,
                poStatus: view.curation?.poStatus ?? "AT_RISK",
                notes: view.curation?.notes ?? null,
                sourceValue: view.sourceValue,
              })
            }
          >
            revisar
          </button>
        )}
        {isSaving && <Loader2 size={11} className="inline animate-spin text-text-faint ml-1" />}
        {erro && (
          <span className="text-risk-critico ml-1" title={erro}>
            !
          </span>
        )}
      </td>
    </tr>
  );
}
