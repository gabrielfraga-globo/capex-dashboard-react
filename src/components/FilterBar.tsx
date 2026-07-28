import { useMemo } from "react";
import { X } from "lucide-react";
import { useFilterStore } from "../store/filterStore";
import { Select } from "./ui/select";
import { Button } from "./ui/primitives";
import type { ProjetoBase, StatusRisco } from "../types";

const STATUS_OPTIONS: StatusRisco[] = ["Estouro", "Baixo comprometimento", "Baixa execução", "OK", "Dados insuficientes"];

export function FilterBar({ projetos }: { projetos: ProjetoBase[] }) {
  const f = useFilterStore();

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
  const nomesProjetos = useMemo(
    () => Array.from(new Set(projetos.map((p) => p.nome))).sort().map((v) => ({ value: v, label: v })),
    [projetos]
  );

  const filtrosAtivos =
    !!f.plataforma || !!f.gestor || !!f.projeto || !!f.aprovador || !!f.status || f.busca !== "" ||
    f.execucaoMin !== 0 || f.execucaoMax !== 100 || f.comprometimentoMin !== 0 || f.comprometimentoMax !== 100;

  return (
    <div className="rounded-card border border-border bg-card p-3 mb-4">
      {/* Filtro global de período */}
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border-subtle">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide mr-1">Período:</span>
        {(["2026", "2027", "Todos"] as const).map((p) => (
          <button
            key={p}
            onClick={() => f.setPeriodo(p)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
              f.periodo === p ? "bg-accent text-white" : "bg-card-alt text-text-muted hover:text-text"
            }`}
          >
            {p === "Todos" ? "🗂️ Todos os anos" : `📅 ${p}`}
          </button>
        ))}
      </div>

      {/* Filtros secundários */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={f.plataforma} onValueChange={f.setPlataforma} options={plataformas} placeholder="Plataforma" />
        <Select value={f.gestor} onValueChange={f.setGestor} options={gestores} placeholder="Gestor" />
        <Select value={f.aprovador} onValueChange={f.setAprovador} options={aprovadores} placeholder="1º Aprovador" />
        <Select value={f.projeto} onValueChange={f.setProjeto} options={nomesProjetos} placeholder="Projeto" />
        <Select
          value={f.status}
          onValueChange={(v) => f.setStatus(v as StatusRisco | null)}
          options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
          placeholder="Status de risco"
        />
        <input
          value={f.busca}
          onChange={(e) => f.setBusca(e.target.value)}
          placeholder="Buscar projeto…"
          className="rounded-md border border-border bg-card-alt px-3 py-1.5 text-xs text-text placeholder:text-text-faint min-w-[160px] outline-none focus:border-accent"
        />

        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <span>Execução</span>
          <input type="number" min={0} max={100} value={f.execucaoMin} onChange={(e) => f.setExecucaoRange(Number(e.target.value), f.execucaoMax)} className="w-14 rounded border border-border bg-card-alt px-1.5 py-1 text-text" />
          <span>–</span>
          <input type="number" min={0} max={100} value={f.execucaoMax} onChange={(e) => f.setExecucaoRange(f.execucaoMin, Number(e.target.value))} className="w-14 rounded border border-border bg-card-alt px-1.5 py-1 text-text" />
          <span>%</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <span>Comprom.</span>
          <input type="number" min={0} max={100} value={f.comprometimentoMin} onChange={(e) => f.setComprometimentoRange(Number(e.target.value), f.comprometimentoMax)} className="w-14 rounded border border-border bg-card-alt px-1.5 py-1 text-text" />
          <span>–</span>
          <input type="number" min={0} max={100} value={f.comprometimentoMax} onChange={(e) => f.setComprometimentoRange(f.comprometimentoMin, Number(e.target.value))} className="w-14 rounded border border-border bg-card-alt px-1.5 py-1 text-text" />
          <span>%</span>
        </div>

        {filtrosAtivos && (
          <Button variant="outline" className="ml-auto flex items-center gap-1" onClick={f.limparFiltros}>
            <X size={13} /> Limpar filtros
          </Button>
        )}
      </div>
    </div>
  );
}
