import { useEffect, useState } from "react";
import type { SaldoProjetosSection } from "../radar/types";

export type SaldoState =
  | { status: "loading" }
  | { status: "unavailable" }                   // 404: fonte ainda não publicada
  | { status: "error"; message: string }
  | { status: "ready"; section: SaldoProjetosSection };

type SaldoSettled = Exclude<SaldoState, { status: "loading" }>;

const SALDO_URL = `${import.meta.env.BASE_URL}data/saldo-projetos.json`;

async function fetchSaldo(): Promise<SaldoSettled> {
  try {
    const res = await fetch(SALDO_URL, { cache: "no-store" });
    if (res.status === 404) return { status: "unavailable" };
    if (!res.ok) return { status: "error", message: `Não foi possível carregar o saldo de projetos (HTTP ${res.status}).` };

    const json: unknown = await res.json();
    if (typeof json !== "object" || json === null || !("schemaVersion" in json) || json.schemaVersion !== 1) {
      return { status: "error", message: "Versão do arquivo de saldo de projetos não suportada." };
    }
    return { status: "ready", section: json as SaldoProjetosSection };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Falha ao carregar o saldo de projetos.",
    };
  }
}

// Uma requisição por carga de página, compartilhada entre os consumidores.
let cached: Promise<SaldoSettled> | null = null;

function loadSaldoOnce(): Promise<SaldoSettled> {
  cached ??= fetchSaldo();
  return cached;
}

export function useSaldoProjetos(): SaldoState {
  const [state, setState] = useState<SaldoState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadSaldoOnce().then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
