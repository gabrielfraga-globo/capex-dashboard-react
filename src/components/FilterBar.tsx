import { useMemo, useState } from "react";
import { X, SlidersHorizontal } from "lucide-react";
import { useFilterStore } from "../store/filterStore";
import { Select } from "./ui/select";
import { Button } from "./ui/primitives";
import type { ProjetoBase, StatusRisco } from "../types";

const STATUS_QUICK: { value: StatusRisco | null; label: string }[] = [
  { value: null, label: "Todos" },
  { value: "Estouro", label: "🔴 Estouro" },
  { value: "Risco de Não Realização", label: "🟠 Risco de Não Realização" },
];

export function FilterBar({ projetos }: { projetos: ProjetoBase[] }) {
  const f = useFilterStore();
  const [showAvancados, setShowAvancados] = useState(false);

  const plataformas = useMemo(
    () => Array.from(new Set(projetos.map((p) => p.n4Curta))).sort().map((v) => ({ value: v, label: v })),
    [projetos]
  );
  const gestores = useMemo(
    () => Array.from(new Set(projetos.map((p) => p.gestor).filter(Boolean) as string[])).sort().map((v) => ({ value: v, label: v })),
    [projetos]
  );
  const aprovadores = useMemo(
    () => Array.from(new Set(projetos.map((p) => p.aprovador).filter(Boolean) as string[])).sort().map((v) => ({ value: v, label: v })),
    [projetos]
  );

  const filtrosAvancadosAtivos =
    !!f.plataforma || !!f.gestor || !!f.aprovador || f.execucaoMin !== 0 || f.execucaoMax !== 100 || f.comprometimentoMin !== 0 || f.comprometimentoMax !== 100;

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_QUICK.map((s) => (
          <button
            key={s.label}
            onClick={() => f.setStatus(s.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              f.status === s.value ? "bg-accent text-white" : "bg-card-alt text-text-muted hover:text-text"
            }`}
          >
            {s.label}
          </button>
        ))}

        <input
          value={f.busca}
          onChange={(e) => f.setBusca(e.target.value)}
          placeholder="Buscar projeto…"
          className="rounded-md border border-border bg-card-alt px-3 py-1.5 text-xs text-text placeholder:text-text-faint w-44 outline-none focus:border-accent"
        />

        <button
          onClick={() => setShowAvancados((v) => !v)}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text ml-auto"
        >
          <SlidersHorizontal size={13} /> Filtros avançados {filtrosAvancadosAtivos && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
        </button>

        {(filtrosAvancadosAtivos || f.status || f.busca) && (
          <Button variant="outline" className="flex items-center gap-1 text-xs" onClick={f.limparFiltros}>
            <X size={13} /> Limpar
          </Button>
        )}
      </div>

      {showAvancados && (
        <div className="flex flex-wrap items-center gap-2 mt-2 rounded-md border border-border bg-card p-2.5">
          <Select value={f.plataforma} onValueChange={f.setPlataforma} options={plataformas} placeholder="Plataforma" />
          <Select value={f.gestor} onValueChange={f.setGestor} options={gestores} placeholder="Gestor" />
          <Select value={f.aprovador} onValueChange={f.setAprovador} options={aprovadores} placeholder="1º Aprovador" />
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <span>Execução</span>
            <input type="number" min={0} max={100} value={f.execucaoMin} onChange={(e) => f.setExecucaoRange(Number(e.target.value), f.execucaoMax)} className="w-14 rounded border border-border bg-card-alt px-1.5 py-1 text-text" />
            <span>–</span>
            <input type="number" min={0} max={100} value={f.execucaoMax} onChange={(e) => f.setExecucaoRange(f.execucaoMin, Number(e.target.value))} className="w-14 rounded border border-border bg-card-alt px-1.5 py-1 text-text" />
            <span>%</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <span>Emitido</span>
            <input type="number" min={0} max={100} value={f.comprometimentoMin} onChange={(e) => f.setComprometimentoRange(Number(e.target.value), f.comprometimentoMax)} className="w-14 rounded border border-border bg-card-alt px-1.5 py-1 text-text" />
            <span>–</span>
            <input type="number" min={0} max={100} value={f.comprometimentoMax} onChange={(e) => f.setComprometimentoRange(f.comprometimentoMin, Number(e.target.value))} className="w-14 rounded border border-border bg-card-alt px-1.5 py-1 text-text" />
            <span>%</span>
          </div>
        </div>
      )}
    </div>
  );
}
