import { X } from "lucide-react";
import { useRecorteStore } from "../store/recorteStore";

interface ChipProps {
  label: string;
  onRemove: () => void;
}

function Chip({ label, onRemove }: ChipProps) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-text"
    >
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remover filtro ${label}`}
        className="inline-flex rounded-full p-0.5 text-text-muted transition-colors hover:bg-card-alt hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  );
}

export function RecorteAtivo() {
  const programa = useRecorteStore((s) => s.programa);
  const rubricas = useRecorteStore((s) => s.rubricas);
  const gestor = useRecorteStore((s) => s.gestor);
  const aprovador = useRecorteStore((s) => s.aprovador);
  const busca = useRecorteStore((s) => s.busca);
  const setPrograma = useRecorteStore((s) => s.setPrograma);
  const setRubricas = useRecorteStore((s) => s.setRubricas);
  const setGestor = useRecorteStore((s) => s.setGestor);
  const setAprovador = useRecorteStore((s) => s.setAprovador);
  const setBusca = useRecorteStore((s) => s.setBusca);
  const limpar = useRecorteStore((s) => s.limpar);

  const termoBusca = busca.trim();
  const temFiltro = Boolean(programa || rubricas.length > 0 || gestor || aprovador || termoBusca);
  if (!temFiltro) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtros aplicados">
      {programa && <Chip label={`Programa: ${programa}`} onRemove={() => setPrograma(null)} />}
      {rubricas.map((r) => (
        <Chip
          key={r}
          label={`Rubrica: ${r}`}
          onRemove={() => setRubricas(rubricas.filter((x) => x !== r))}
        />
      ))}
      {gestor && <Chip label={`Gestor: ${gestor}`} onRemove={() => setGestor(null)} />}
      {aprovador && <Chip label={`Aprovador: ${aprovador}`} onRemove={() => setAprovador(null)} />}
      {termoBusca && <Chip label={`Busca: “${termoBusca}”`} onRemove={() => setBusca("")} />}
      <button
        type="button"
        onClick={limpar}
        className="text-xs font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
      >
        Limpar tudo
      </button>
    </div>
  );
}
