// Parse pesado em background — 2 fases: base (rápida) → full (abas lentas).
// Main thread recebe fase base primeiro e renderiza o dashboard imediatamente.
import { createParseWorkbookDiagnostics, parseWorkbookBufferPhased } from './excelParser';

let workerRunSeq = 0;

self.addEventListener('message', async (e: MessageEvent) => {
  workerRunSeq += 1;
  const runId = workerRunSeq;
  const { buf, fileName } = e.data as { buf: ArrayBuffer; fileName: string };
  const t0 = performance.now();
  const diagnostics = createParseWorkbookDiagnostics();

  try {
    // Fase 1: XLSX.read + abas rápidas (Orçamento, Realizado, Hierarquia)
    const { base, computeFull } = parseWorkbookBufferPhased(buf, fileName, diagnostics);
    const t1 = performance.now();
    console.log(`[Worker#${runId}] Phase 1 (base) concluída: ${(t1 - t0).toFixed(1)}ms`);
    console.log(
      `[Worker#${runId}][Diag] XLSX.read=${diagnostics.xlsxReadMs.toFixed(1)}ms | sheet_to_json Orçamento=${(diagnostics.sheetToJsonMs['Orçamento'] ?? 0).toFixed(1)}ms (${diagnostics.sheetRows['Orçamento'] ?? 0} linhas) | sheet_to_json Realizado=${(diagnostics.sheetToJsonMs['Realizado'] ?? 0).toFixed(1)}ms (${diagnostics.sheetRows['Realizado'] ?? 0} linhas) | sheet_to_json Hierarquia=${(diagnostics.sheetToJsonMs['Hierarquia'] ?? 0).toFixed(1)}ms (${diagnostics.sheetRows['Hierarquia'] ?? 0} linhas) | agregação base=${diagnostics.aggregationBaseMs.toFixed(1)}ms`
    );

    const tPostBase0 = performance.now();
    self.postMessage({ ok: true, phase: 'base', result: base });
    const postBaseMs = performance.now() - tPostBase0;
    console.log(`[Worker#${runId}][Diag] postMessage phase=base: ${postBaseMs.toFixed(1)}ms`);

    // Yield — permite o main thread processar a fase base e re-renderizar antes de continuar
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    // Fase 2: abas lentas (Realizado detalhado + Compromisso detalhado)
    const tPhase2Start = performance.now();
    const full = computeFull();
    const t2 = performance.now();
    console.log(`[Worker#${runId}] Phase 2 (full) concluída: ${(t2 - t0).toFixed(1)}ms`);
    console.log(
      `[Worker#${runId}][Diag] xlsxRead_slow=${diagnostics.xlsxReadSlowMs.toFixed(1)}ms | sheet_to_json Realizado detalhado=${(diagnostics.sheetToJsonMs['Realizado detalhado'] ?? 0).toFixed(1)}ms (${diagnostics.sheetRows['Realizado detalhado'] ?? 0} linhas) | sheet_to_json Compromisso detalhado=${(diagnostics.sheetToJsonMs['Compromisso detalhado'] ?? 0).toFixed(1)}ms (${diagnostics.sheetRows['Compromisso detalhado'] ?? 0} linhas) | agregação full=${diagnostics.aggregationFullMs.toFixed(1)}ms | computeFull total=${(t2 - tPhase2Start).toFixed(1)}ms`
    );

    const tPostFull0 = performance.now();
    self.postMessage({ ok: true, phase: 'full', result: full });
    const postFullMs = performance.now() - tPostFull0;
    console.log(`[Worker#${runId}][Diag] postMessage phase=full: ${postFullMs.toFixed(1)}ms`);

    console.log(
      `[Worker#${runId}][Diag][Resumo] xlsxRead_fast=${diagnostics.xlsxReadMs.toFixed(1)}ms | xlsxRead_slow=${diagnostics.xlsxReadSlowMs.toFixed(1)}ms | sheet_to_json_total=${Object.values(diagnostics.sheetToJsonMs).reduce((acc, cur) => acc + (cur ?? 0), 0).toFixed(1)}ms | agregacao_total=${(diagnostics.aggregationBaseMs + diagnostics.aggregationFullMs).toFixed(1)}ms | postMessage_total=${(postBaseMs + postFullMs).toFixed(1)}ms | pipeline_total=${(t2 - t0).toFixed(1)}ms`
    );
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
