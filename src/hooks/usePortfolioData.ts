import { useEffect, useState } from "react";
import type { RelatorioParsing } from "../types";
import { loadPortfolioData } from "../lib/dataSource";

interface PortfolioDataResult {
  parsed: RelatorioParsing | null;
  loadError: string | null;
}

export function usePortfolioData(): PortfolioDataResult {
  const [parsed, setParsed] = useState<RelatorioParsing | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadPortfolioData()
      .then(setParsed)
      .catch((e) =>
        setLoadError(
          e instanceof Error ? e.message : "Falha ao carregar os dados da carteira."
        )
      );
  }, []);

  return { parsed, loadError };
}
