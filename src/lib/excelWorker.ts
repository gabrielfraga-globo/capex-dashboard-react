// Parse pesado do Excel em background — nunca bloqueia a main thread.
import { parseWorkbookBuffer } from './excelParser';

self.addEventListener('message', async (e: MessageEvent) => {
  const { buf, fileName } = e.data as { buf: ArrayBuffer; fileName: string };
  try {
    const result = await parseWorkbookBuffer(buf, fileName);
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
