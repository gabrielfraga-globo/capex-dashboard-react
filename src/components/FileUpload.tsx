import { useCallback, useRef, useState } from "react";
import { UploadCloud, FileSpreadsheet, AlertTriangle, Loader2 } from "lucide-react";
import { parseExcelFile } from "../lib/excelParser";
import type { RelatorioParsing } from "../types";

export function FileUpload({ onLoaded }: { onLoaded: (r: RelatorioParsing) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!/\.xlsx?$/i.test(file.name)) {
        setError("Formato inválido. Envie um arquivo .xlsx ou .xls exportado do BI atual.");
        return;
      }
      setLoading(true);
      try {
        const result = await parseExcelFile(file);
        onLoaded(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível ler o arquivo. Verifique se ele tem as 4 abas esperadas.");
      } finally {
        setLoading(false);
      }
    },
    [onLoaded]
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="max-w-lg w-full text-center">
        <div className="flex justify-center mb-4">
          <div className="rounded-full bg-card-alt border border-border p-4">
            <FileSpreadsheet size={32} className="text-accent" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-text mb-1">Carteira CAPEX — Plataformas de Produção</h1>
        <p className="text-text-muted text-sm mb-6">
          Envie o Excel com as abas "Orçamento", "Realizado", "Hierarquia" e "Status Report". O
          processamento acontece inteiramente no seu navegador — nenhum dado é enviado a servidores externos.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-card border-2 border-dashed p-10 transition-colors ${
            dragOver ? "border-accent bg-card-alt" : "border-border bg-card"
          }`}
        >
          {loading ? (
            <div className="flex flex-col items-center gap-3 text-text-muted">
              <Loader2 className="animate-spin text-accent" size={28} />
              <span className="text-sm">Lendo e processando planilha…</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-text-muted">
              <UploadCloud size={28} />
              <span className="text-sm">Arraste o arquivo aqui ou clique para selecionar</span>
              <span className="text-xs text-text-faint">.xlsx ou .xls</span>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-risk-critico/40 bg-risk-critico/10 p-3 text-left text-sm text-red-300">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
