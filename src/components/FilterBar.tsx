import { useMemo, useState } from "react";
import { X, SlidersHorizontal } from "lucide-react";
import { useFilterStore } from "../store/filterStore";
import { useShallow } from "zustand/react/shallow";
import { Select } from "./ui/select";
import { Button } from "./ui/primitives";
import type { ProjetoBase, StatusRisco } from "../types";

const STATUS_QUICK: { value: StatusRisco | null; label: string }[] = [
  { value: null, label: "Todos" },
  { value: "Estouro", label: "🔴 Estouro" },
  { value: "Risco de Não Realização", label: "🟠 Risco de Não Realização" },
  { value: "Revisar Caixa Ano", label: "🔵 Revisar Caixa Ano" },
];

export function FilterBar({ projetos }: { projetos: ProjetoBase[] }) {
  // Shallow selector: re-renderiza só quando um valor visível muda
  const { status, busca, plataforma, gestor, aprovador, execucaoMin, execucaoMax, comprometimentoMin, comprometimentoMax } = useFilterStore(
    useShallow(s => ({
      status: s.status,
      busca: s.busca,
      plataforma: s.plataforma,
      gestor: s.gestor,
      aprovador: s.aprovador,
      execucaoMin: s.execucaoMin,
      execucaoMax: s.execucaoMax,
      comprometimentoMin: s.comprometimentoMin,
      comprometimentoMax: s.comprometimentoMax,
    }))
  );
  // Ações têm referência estável no Zustand — esses seletores nunca disparam re-render
  const setStatus = useFilterStore(s => s.setStatus);
  const setBusca = useFilterStore(s => s.setBusca);
  const setPlataforma = useFilterStore(s => s.setPlataforma);
  const setGestor = useFilterStore(s => s.setGestor);
  const setAprovador = useFilterStore(s => s.setAprovador);
  const setExecucaoRange = useFilterStore(s => s.setExecucaoRange);
  const setComprometimentoRange = useFilterStore(s => s.setComprometimentoRange);
  const limparFiltros = useFilterStore(s => s.limparFiltros);
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
    !!plataforma || !!gestor || !!aprovador || execucaoMin !== 0 || execucaoMax !== 100 || comprometimentoMin !== 0 || comprometimentoMax !== 100;

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_QUICK.map((s) => (
          <button
            key={s.label}
            onClick={() => setStatus(s.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              status === s.value ? "bg-accent text-white" : "bg-card-alt text-text-muted hover:text-text"
            }`}
          >
            {s.label}
          </button>
        ))}

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar projeto…"
          className="rounded-md border border-border bg-card-alt px-3 py-1.5 text-xs text-text placeholder:text-text-faint w-44 outline-none focus:border-accent"
        />

        <button
          onClick={() => setShowAvancados((v) => !v)}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text ml-auto"
        >
          <SlidersHorizontal size={13} /> Filtros avançados {filtrosAvancadosAtivos && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
        </button>

        {(filtrosAvancadosAtivos || status || busca) && (
          <Button variant="outline" className="flex items-center gap-1 text-xs" onClick={limparFiltros}>
            <X size={13} /> Limpar
          </Button>
        )}
      </div>

      {showAvancados && (
        <div className="flex flex-wrap items-center gap-2 mt-2 rounded-md border border-border bg-card p-2.5">
          <Select value={plataforma} onValueChange={setPlataforma} options={plataformas} placeholder="Plataforma" />
          <Select value={gestor} onValueChange={setGestor} options={gestores} placeholder="Gestor" />
          <Select value={aprovador} onValueChange={setAprovador} options={aprovadores} placeholder="1º Aprovador" />
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <span>Execução</span>
            <input type="number" min={0} max={100} value={execucaoMin} onChange={(e) => setExecucaoRange(Number(e.target.value), execucaoMax)} className="w-14 rounded border border-border bg-card-alt px-1.5 py-1 text-text" />
            <span>–</span>
            <input type="number" min={0} max={100} value={execucaoMax} onChange={(e) => setExecucaoRange(execucaoMin, Number(e.target.value))} className="w-14 rounded border border-border bg-card-alt px-1.5 py-1 text-text" />
            <span>%</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <span>Emitido</span>
            <input type="number" min={0} max={100} value={comprometimentoMin} onChange={(e) => setComprometimentoRange(Number(e.target.value), comprometimentoMax)} className="w-14 rounded border border-border bg-card-alt px-1.5 py-1 text-text" />
            <span>–</span>
            <input type="number" min={0} max={100} value={comprometimentoMax} onChange={(e) => setComprometimentoRange(comprometimentoMin, Number(e.target.value))} className="w-14 rounded border border-border bg-card-alt px-1.5 py-1 text-text" />
            <span>%</span>
          </div>
        </div>
      )}
    </div>
  );
}
