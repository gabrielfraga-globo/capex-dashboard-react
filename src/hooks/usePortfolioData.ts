import { useEffect, useState } from "react";
import type { RelatorioParsing } from "../types";

// ✅ UI não congela: fetch é async, parse roda em Web Worker separado.
const DATA_URL = `${import.meta.env.BASE_URL}data/carteira.xlsx`;

interface PortfolioDataResult {
  parsed: RelatorioParsing | null;
  loadError: string | null;
}

export function usePortfolioData(): PortfolioDataResult {
  const [parsed, setParsed] = useState<RelatorioParsing | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const worker = new Worker(
      new URL('../lib/excelWorker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (e: MessageEvent) => {
      const data = e.data as { ok: boolean; result?: RelatorioParsing; error?: string };
      if (data.ok && data.result) {
        setParsed(data.result);
      } else {
        setLoadError(data.error ?? 'Falha ao processar os dados da carteira.');
      }
      worker.terminate();
    };

    worker.onerror = (e) => {
      setLoadError(e.message ?? 'Erro no processamento dos dados.');
      worker.terminate();
    };

    fetch(DATA_URL, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`Não foi possível carregar ${DATA_URL} (HTTP ${res.status}).`);
        return res.arrayBuffer();
      })
      .then((buf) => {
        // Transfere o ArrayBuffer sem cópia (zero-copy) para o worker
        worker.postMessage({ buf, fileName: 'carteira.xlsx' }, [buf]);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Falha ao carregar os dados da carteira.');
        worker.terminate();
      });

    return () => { worker.terminate(); };
  }, []);

  return { parsed, loadError };
}
