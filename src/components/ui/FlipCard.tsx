import { useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Card } from "./primitives";
import { cn } from "../../lib/utils";

export interface FlipCardProps {
  front: ReactNode;
  back: ReactNode;
  frontLabel: string;
  backLabel: string;
  defaultSide?: "front" | "back";
  className?: string;
}

export function FlipCard({
  front,
  back,
  frontLabel,
  backLabel,
  defaultSide = "front",
  className,
}: FlipCardProps) {
  const [virado, setVirado] = useState(defaultSide === "back");
  const focoPendente = useRef(false);
  const frenteRef = useRef<HTMLDivElement>(null);
  const versoRef = useRef<HTMLDivElement>(null);

  const ladoAtual = virado ? backLabel : frontLabel;
  const outroLado = virado ? frontLabel : backLabel;
  const frenteOculta = virado;
  const versoOculto = !virado;

  // Após virar, a face visível já não está inert; só então o foco pode ir ao título.
  useEffect(() => {
    if (!focoPendente.current) return;
    focoPendente.current = false;
    const face = virado ? versoRef.current : frenteRef.current;
    const titulo = face?.querySelector<HTMLElement>("[data-flip-title]");
    if (!titulo) return;
    if (!titulo.hasAttribute("tabindex")) titulo.setAttribute("tabindex", "-1");
    titulo.focus();
  }, [virado]);

  const alternar = () => {
    focoPendente.current = true;
    setVirado((v) => !v);
  };

  return (
    <Card className={cn("flip-perspective p-0", className)}>
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          {ladoAtual}
        </span>
        <button
          type="button"
          aria-pressed={virado}
          aria-label={`Alternar para ${outroLado}`}
          onClick={alternar}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <RefreshCw size={13} aria-hidden="true" />
          <span>Ver {outroLado}</span>
        </button>
      </div>

      <div
        data-flipped={virado}
        className="flip-stage grid motion-safe:transition-transform motion-safe:duration-[400ms]"
      >
        <div
          ref={frenteRef}
          style={{ gridArea: "1 / 1" }}
          aria-hidden={frenteOculta}
          inert={frenteOculta}
          className={cn(
            "flip-face px-4 pb-4 motion-reduce:transition-opacity motion-reduce:duration-150",
            frenteOculta && "motion-reduce:opacity-0"
          )}
        >
          {front}
        </div>
        <div
          ref={versoRef}
          style={{ gridArea: "1 / 1" }}
          aria-hidden={versoOculto}
          inert={versoOculto}
          className={cn(
            "flip-face flip-face-back px-4 pb-4 motion-reduce:transition-opacity motion-reduce:duration-150",
            versoOculto && "motion-reduce:opacity-0"
          )}
        >
          {back}
        </div>
      </div>
    </Card>
  );
}
