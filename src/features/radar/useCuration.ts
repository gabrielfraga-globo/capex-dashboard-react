import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CommitmentCuration,
  CommitmentSourceBundle,
  CommitmentView,
  CurationMap,
  CurationUpsertRequest,
  RadarSummary,
  RcCurationUpsertRequest,
  RcCurationUpsertResponse,
  RcView,
} from "./types";
import { mergearRadar } from "./merge";

const BUNDLE_URL = `${import.meta.env.BASE_URL}data/radar-bundle.json`;
const CURATION_URL = "/api/curation";
const USER_EMAIL = import.meta.env.VITE_USER_EMAIL ?? "gabriel.fraga@g.globo";

const buildCurationHeaders = (withJsonBody = false): HeadersInit => {
  const headers: HeadersInit = {
    "x-user-email": USER_EMAIL,
  };

  if (withJsonBody) {
    return {
      ...headers,
      "Content-Type": "application/json",
    };
  }

  return headers;
};

export interface UseCurationResult {
  isLoading: boolean;
  error: string | null;
  bundle: CommitmentSourceBundle | null;
  views: CommitmentView[];
  rcViews: RcView[];
  resumo: RadarSummary | null;
  /** chave = commitmentKey para curadoria individual, `rc:<rc>` para curadoria em lote */
  isSaving: (chave: string) => boolean;
  erroDe: (chave: string) => string | null;
  salvarChave: (commitmentKey: string, payload: CurationUpsertRequest) => Promise<boolean>;
  salvarRc: (rc: string, payload: RcCurationUpsertRequest) => Promise<RcCurationUpsertResponse | null>;
  curationMap: CurationMap;
}

/** Busca o JSON do BI + a curadoria salva e produz as views prontas para a tela do Radar. */
export function useCuration(): UseCurationResult {
  const [bundle, setBundle] = useState<CommitmentSourceBundle | null>(null);
  const [curationMap, setCurationMap] = useState<CurationMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingSet, setSavingSet] = useState<Set<string>>(new Set());
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});
  const montado = useRef(true);

  const carregarCuradoria = useCallback(async () => {
    try {
      const res = await fetch(CURATION_URL, {
        cache: "no-store",
        headers: buildCurationHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: CurationMap };
      if (montado.current) setCurationMap(json.data);
    } catch {
      // Ambiente sem a API disponível (ex.: vite dev sem o proxy de identidade) —
      // degrada para "nada curado ainda" em vez de bloquear a tela.
      if (montado.current) setCurationMap({});
    }
  }, []);

  useEffect(() => {
    montado.current = true;
    setIsLoading(true);
    setError(null);

    Promise.all([
      fetch(BUNDLE_URL, { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`Não foi possível carregar ${BUNDLE_URL} (HTTP ${res.status}).`);
        return res.json() as Promise<CommitmentSourceBundle>;
      }),
      carregarCuradoria(),
    ])
      .then(([bundleJson]) => {
        if (montado.current) setBundle(bundleJson);
      })
      .catch((err: unknown) => {
        if (montado.current) setError(err instanceof Error ? err.message : "Falha ao carregar o Radar.");
      })
      .finally(() => {
        if (montado.current) setIsLoading(false);
      });

    return () => {
      montado.current = false;
    };
  }, [carregarCuradoria]);

  const merged = useMemo(() => {
    if (!bundle) return null;
    return mergearRadar(bundle, curationMap, bundle.exerciseYear);
  }, [bundle, curationMap]);

  const setSaving = useCallback((chave: string, ativo: boolean) => {
    setSavingSet((prev) => {
      const next = new Set(prev);
      if (ativo) next.add(chave);
      else next.delete(chave);
      return next;
    });
  }, []);

  const setErro = useCallback((chave: string, mensagem: string | null) => {
    setErrorMap((prev) => {
      const next = { ...prev };
      if (mensagem) next[chave] = mensagem;
      else delete next[chave];
      return next;
    });
  }, []);

  const aplicarCuradoriaLocal = useCallback(
    (chave: string, patch: Partial<CommitmentCuration> & { sourceValue?: number }, nivel: "KEY" | "RC") => {
      setCurationMap((prev) => {
        const atual = prev[chave];
        const next = { ...prev };
        next[chave] = {
          commitmentKey: chave,
          estimatedDeliveryDate: patch.estimatedDeliveryDate ?? atual?.estimatedDeliveryDate ?? null,
          poStatus: patch.poStatus ?? atual?.poStatus ?? "AT_RISK",
          notes: patch.notes ?? atual?.notes ?? null,
          sourceValueAtCuration: patch.sourceValueAtCuration ?? atual?.sourceValueAtCuration ?? patch.sourceValue ?? null,
          curationLevel: nivel,
          inheritedFromKey: atual?.inheritedFromKey ?? null,
          updatedBy: atual?.updatedBy ?? "local",
          updatedAt: new Date().toISOString(),
        };
        return next;
      });
    },
    []
  );

  const salvarChave = useCallback(
    async (commitmentKey: string, payload: CurationUpsertRequest) => {
      const antes = curationMap[commitmentKey];
      setSaving(commitmentKey, true);
      setErro(commitmentKey, null);
      aplicarCuradoriaLocal(
        commitmentKey,
        {
          estimatedDeliveryDate: payload.estimatedDeliveryDate,
          poStatus: payload.poStatus,
          notes: payload.notes,
          sourceValueAtCuration: antes?.sourceValueAtCuration ?? payload.sourceValue,
          sourceValue: payload.sourceValue,
        },
        "KEY"
      );
      try {
        const res = await fetch(`${CURATION_URL}/key/${encodeURIComponent(commitmentKey)}`, {
          method: "PUT",
          headers: buildCurationHeaders(true),
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        await carregarCuradoria();
        return true;
      } catch (err) {
        setCurationMap((prev) => {
          const next = { ...prev };
          if (antes) next[commitmentKey] = antes;
          else delete next[commitmentKey];
          return next;
        });
        setErro(commitmentKey, err instanceof Error ? err.message : "Falha ao salvar.");
        return false;
      } finally {
        setSaving(commitmentKey, false);
      }
    },
    [aplicarCuradoriaLocal, carregarCuradoria, curationMap, setErro, setSaving]
  );

  const salvarRc = useCallback(
    async (rc: string, payload: RcCurationUpsertRequest) => {
      const chave = `rc:${rc}`;
      const snapshot = { ...curationMap };
      setSaving(chave, true);
      setErro(chave, null);
      for (const target of payload.targets) {
        const atual = curationMap[target.commitmentKey];
        setCurationMap((prev) => {
          const next = { ...prev };
          next[target.commitmentKey] = {
            commitmentKey: target.commitmentKey,
            estimatedDeliveryDate: payload.estimatedDeliveryDate,
            poStatus: payload.poStatus,
            notes: payload.notes,
            sourceValueAtCuration: atual?.sourceValueAtCuration ?? target.sourceValue,
            curationLevel: atual?.curationLevel ?? "RC",
            inheritedFromKey: atual?.inheritedFromKey ?? null,
            updatedBy: atual?.updatedBy ?? "local",
            updatedAt: new Date().toISOString(),
          };
          return next;
        });
      }
      try {
        const res = await fetch(`${CURATION_URL}/rc/${encodeURIComponent(rc)}`, {
          method: "PUT",
          headers: buildCurationHeaders(true),
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((body as { error?: string } | null)?.error ?? `HTTP ${res.status}`);
        }
        await carregarCuradoria();
        return body as RcCurationUpsertResponse;
      } catch (err) {
        setCurationMap(snapshot);
        setErro(chave, err instanceof Error ? err.message : "Falha ao salvar.");
        return null;
      } finally {
        setSaving(chave, false);
      }
    },
    [carregarCuradoria, curationMap, setErro, setSaving]
  );

  return {
    isLoading,
    error,
    bundle,
    views: merged?.views ?? [],
    rcViews: merged?.rcViews ?? [],
    resumo: merged?.resumo ?? null,
    isSaving: (chave: string) => savingSet.has(chave),
    erroDe: (chave: string) => errorMap[chave] ?? null,
    salvarChave,
    salvarRc,
    curationMap,
  };
}
