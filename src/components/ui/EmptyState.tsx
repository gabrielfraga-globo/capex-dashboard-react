import { SearchX } from "lucide-react";
import { useFilterStore } from "../../store/filterStore";

interface Props {
  title?: string;
  description?: string;
  showClearFilters?: boolean;
}

export function EmptyState({
  title = "Nenhum resultado encontrado",
  description = "Nenhum projeto corresponde aos filtros aplicados.",
  showClearFilters = true,
}: Props) {
  const limparFiltros = useFilterStore((s) => s.limparFiltros);

  return (
    <div
      className="flex flex-col items-center justify-center py-10 text-center gap-3"
      role="status"
      aria-live="polite"
    >
      <SearchX size={32} className="text-text-faint" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-text">{title}</p>
        <p className="text-xs text-text-muted mt-0.5">{description}</p>
      </div>
      {showClearFilters && (
        <button
          onClick={limparFiltros}
          className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-text-muted hover:text-text hover:border-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
        >
          Limpar Filtros
        </button>
      )}
    </div>
  );
}
