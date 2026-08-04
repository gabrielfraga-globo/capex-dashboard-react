import { useEffect, useRef, useState } from "react";
import type { RelatorioParsing } from "../types";

const PROCESSED_DATA_URL = `${import.meta.env.BASE_URL}data/carteira-processed.json`;
const RAW_DATA_URL = `${import.meta.env.BASE_URL}data/carteira.xlsx`;
const ENABLE_RAW_XLSX_FALLBACK = import.meta.env.DEV && import.meta.env.VITE_USE_RAW_EXCEL === "true";

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
    let worker: Worker | null = null;

    const loadFromRawExcelWorker = () => {
      worker = new Worker(
        new URL("../lib/excelWorker.ts", import.meta.url),
        { type: "module" }
      );

      worker.onmessage = (e: MessageEvent) => {
        const data = e.data as {
          ok: boolean;
          phase?: "base" | "full";
          result?: RelatorioParsing;
          error?: string;
        };

        if (data.ok && data.result) {
          const elapsed = (performance.now() - t0Ref.current).toFixed(1);
          if (data.phase === "base") {
            console.log(`[usePortfolioData] Fallback Worker phase=base: +${elapsed}ms`);
            setParsed(data.result);
            setIsLoadingCompromisso(true);
          } else {
            console.log(`[usePortfolioData] Fallback Worker phase=full: +${elapsed}ms`);
            setParsed(data.result);
            setIsLoadingCompromisso(false);
            worker?.terminate();
          }
        } else {
          setLoadError(data.error ?? "Falha ao processar os dados da carteira.");
          worker?.terminate();
        }
      };

      worker.onerror = (e) => {
        setLoadError(e.message ?? "Erro no processamento dos dados.");
        worker?.terminate();
      };

      fetch(RAW_DATA_URL, { cache: "no-store" })
        .then((res) => {
          if (!res.ok) throw new Error(`Não foi possível carregar ${RAW_DATA_URL} (HTTP ${res.status}).`);
          return res.arrayBuffer();
        })
        .then((buf) => {
          worker?.postMessage({ buf, fileName: "carteira.xlsx" }, [buf]);
        })
        .catch((err: unknown) => {
          setLoadError(err instanceof Error ? err.message : "Falha ao carregar os dados da carteira.");
          worker?.terminate();
        });
    };

    t0Ref.current = performance.now();
    setLoadError(null);
    setIsLoadingCompromisso(false);
    console.log(`[usePortfolioData] Fetch JSON pré-processado iniciado: ${t0Ref.current.toFixed(1)}ms`);

    fetch(PROCESSED_DATA_URL, { cache: "no-store" })
      .then((res) => {
        const elapsed = (performance.now() - t0Ref.current).toFixed(1);
        console.log(`[usePortfolioData] Fetch JSON concluído: +${elapsed}ms`);
        if (!res.ok) throw new Error(`Não foi possível carregar ${PROCESSED_DATA_URL} (HTTP ${res.status}).`);
        return res.json() as Promise<RelatorioParsing>;
      })
      .then((json) => {
        const elapsed = (performance.now() - t0Ref.current).toFixed(1);
        console.log(`[usePortfolioData] JSON aplicado no estado: +${elapsed}ms`);
        setParsed(json);
        setIsLoadingCompromisso(false);
      })
      .catch((err: unknown) => {
        if (ENABLE_RAW_XLSX_FALLBACK) {
          console.warn("[usePortfolioData] Falha no JSON pré-processado; usando fallback RAW XLSX em Worker.", err);
          loadFromRawExcelWorker();
          return;
        }
        setLoadError(err instanceof Error ? err.message : "Falha ao carregar os dados da carteira.");
        worker?.terminate();
      });

    return () => { worker?.terminate(); };
  }, []);

  return { parsed, isLoadingCompromisso, loadError };
}
