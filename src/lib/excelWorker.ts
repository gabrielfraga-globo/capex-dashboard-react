// Parse pesado em background — 2 fases: base (rápida) → full (abas lentas).
// Main thread recebe fase base primeiro e renderiza o dashboard imediatamente.
import { parseWorkbookBufferPhased } from './excelParser';

self.addEventListener('message', async (e: MessageEvent) => {
  const { buf, fileName } = e.data as { buf: ArrayBuffer; fileName: string };
  const t0 = performance.now();

  try {
    // Fase 1: XLSX.read + abas rápidas (Orçamento, Realizado, Hierarquia)
    const { base, computeFull } = parseWorkbookBufferPhased(buf, fileName);
    const t1 = performance.now();
    console.log(`[Worker] Phase 1 (base) concluída: ${(t1 - t0).toFixed(1)}ms`);

    self.postMessage({ ok: true, phase: 'base', result: base });

    // Yield — permite o main thread processar a fase base e re-renderizar antes de continuar
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    // Fase 2: abas lentas (Realizado detalhado + Compromisso detalhado)
    const full = computeFull();
    const t2 = performance.now();
    console.log(`[Worker] Phase 2 (full) concluída: ${(t2 - t0).toFixed(1)}ms`);

    self.postMessage({ ok: true, phase: 'full', result: full });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
