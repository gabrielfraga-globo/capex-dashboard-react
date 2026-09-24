import { useEffect, useRef, useState } from "react";
import type { RelatorioParsing } from "../types";

const PROCESSED_DATA_URL = `${import.meta.env.BASE_URL}data/carteira-processed.json`;

interface PortfolioDataResult {
  parsed: RelatorioParsing | null;
  isLoadingCompromisso: boolean;
  loadError: string | null;
}

export function usePortfolioData(): PortfolioDataResult {
  const [parsed, setParsed] = useState<RelatorioParsing | null>(null);
  const [isLoadingCompromisso, setIsLoadingCompromisso] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const t0Ref = useRef<number>(0);

  useEffect(() => {
    t0Ref.current = performance.now();
    setLoadError(null);
    setIsLoadingCompromisso(false);

    fetch(PROCESSED_DATA_URL, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`Não foi possível carregar ${PROCESSED_DATA_URL} (HTTP ${res.status}).`);
        return res.json() as Promise<RelatorioParsing>;
      })
      .then((json) => {
        setParsed(json);
        setIsLoadingCompromisso(false);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Falha ao carregar os dados da carteira.");
      });
  }, []);

  return { parsed, isLoadingCompromisso, loadError };
}
