import { useEffect, useRef, useState } from "react";
import type { RelatorioParsing } from "../types";

// ✅ UI não congela: fetch é async, parse roda em Web Worker separado em 2 fases.
const DATA_URL = `${import.meta.env.BASE_URL}data/carteira.xlsx`;

interface PortfolioDataResult {
  parsed: RelatorioParsing | null;
  /** true enquanto a fase 2 (abas lentas) ainda não chegou — áreas dependentes de
   *  "Compromisso detalhado" e "Realizado detalhado" devem exibir skeleton. */
  isLoadingCompromisso: boolean;
  loadError: string | null;
}

export function usePortfolioData(): PortfolioDataResult {
  const [parsed, setParsed] = useState<RelatorioParsing | null>(null);
  const [isLoadingCompromisso, setIsLoadingCompromisso] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const t0Ref = useRef<number>(0);

  useEffect(() => {
    const worker = new Worker(
      new URL('../lib/excelWorker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (e: MessageEvent) => {
      const data = e.data as {
        ok: boolean;
        phase?: 'base' | 'full';
        result?: RelatorioParsing;
        error?: string;
      };

      if (data.ok && data.result) {
        const elapsed = (performance.now() - t0Ref.current).toFixed(1);
        if (data.phase === 'base') {
          console.log(`[usePortfolioData] Phase 1 (base) recebida no main thread: +${elapsed}ms`);
          setParsed(data.result);
          setIsLoadingCompromisso(true);
        } else {
          console.log(`[usePortfolioData] Phase 2 (full) recebida no main thread: +${elapsed}ms`);
          setParsed(data.result);
          setIsLoadingCompromisso(false);
          worker.terminate();
        }
      } else {
        setLoadError(data.error ?? 'Falha ao processar os dados da carteira.');
        worker.terminate();
      }
    };

    worker.onerror = (e) => {
      setLoadError(e.message ?? 'Erro no processamento dos dados.');
      worker.terminate();
    };

    t0Ref.current = performance.now();
    console.log(`[usePortfolioData] Fetch iniciado: ${t0Ref.current.toFixed(1)}ms`);

    fetch(DATA_URL, { cache: 'no-store' })
      .then((res) => {
        const elapsed = (performance.now() - t0Ref.current).toFixed(1);
        console.log(`[usePortfolioData] Fetch concluído: +${elapsed}ms`);
        if (!res.ok) throw new Error(`Não foi possível carregar ${DATA_URL} (HTTP ${res.status}).`);
        return res.arrayBuffer();
      })
      .then((buf) => {
        const elapsed = (performance.now() - t0Ref.current).toFixed(1);
        console.log(`[usePortfolioData] Enviando para Worker: +${elapsed}ms`);
        worker.postMessage({ buf, fileName: 'carteira.xlsx' }, [buf]);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Falha ao carregar os dados da carteira.');
        worker.terminate();
      });

    return () => { worker.terminate(); };
  }, []);

  return { parsed, isLoadingCompromisso, loadError };
}
