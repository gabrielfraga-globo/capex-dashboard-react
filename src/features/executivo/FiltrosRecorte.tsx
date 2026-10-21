import { useState, useMemo } from "react";
import { Filter } from "lucide-react";
import type { ProjetoMetricas } from "../../types";
import { useRecorteStore } from "../../store/recorteStore";
import { Select } from "../../components/ui/select";

export function FiltrosRecorte({
  lista,
  rubricasOptions,
}: {
  lista: ProjetoMetricas[];
  rubricasOptions: string[];
}) {
  const programa = useRecorteStore((s) => s.programa);
  const rubricas = useRecorteStore((s) => s.rubricas);
  const gestor = useRecorteStore((s) => s.gestor);
  const aprovador = useRecorteStore((s) => s.aprovador);
  const busca = useRecorteStore((s) => s.busca);
  const setPrograma = useRecorteStore((s) => s.setPrograma);
  const setRubricas = useRecorteStore((s) => s.setRubricas);
  const limpar = useRecorteStore((s) => s.limpar);
  const [showFilters, setShowFilters] = useState(false);

  const filtrosAtivos = (programa ? 1 : 0) + (gestor ? 1 : 0) + (aprovador ? 1 : 0) + rubricas.length + (busca.trim() ? 1 : 0);

  const programasOptions = useMemo(() => {
    const set = new Set(lista.map(p => p.n4Curta).filter(Boolean));
    return Array.from(set).sort().map(p => ({ value: p, label: p }));
  }, [lista]);

  return (
        <div className="relative">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 text-xs font-semibold text-text border border-border bg-card-alt px-3 py-1.5 rounded-md hover:border-accent transition-colors ${showFilters ? "border-accent" : ""}`}
          >
            <Filter size={14} /> Filtros ▾
            {filtrosAtivos > 0 && (
              <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] text-white">
                {filtrosAtivos}
              </span>
            )}
          </button>
          
          {showFilters && (
            <div className="absolute top-full right-0 mt-2 z-50 w-64 p-3 rounded-card border border-border bg-card shadow-lg flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-semibold text-text-muted mb-1 block">Programa</label>
                <Select value={programa} onValueChange={setPrograma} options={programasOptions} placeholder="Todos os programas" className="w-full" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-text-muted mb-1 block">Rubricas</label>
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                  {rubricasOptions.map(r => (
                    <label key={r} className="flex items-center gap-2 text-xs cursor-pointer text-text hover:bg-bg p-1 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={rubricas.includes(r)}
                        onChange={(e) => {
                          if (e.target.checked) setRubricas([...rubricas, r]);
                          else setRubricas(rubricas.filter(x => x !== r));
                        }}
                        className="rounded border-border text-accent focus:ring-accent w-3 h-3"
                      />
                      <span className="truncate">{r}</span>
                    </label>
                  ))}
                </div>
              </div>
              {filtrosAtivos > 0 && (
                <button type="button" onClick={limpar} className="self-end text-xs font-semibold text-accent hover:underline">
                  Limpar ({filtrosAtivos})
                </button>
              )}
            </div>
          )}
        </div>
  );
}
