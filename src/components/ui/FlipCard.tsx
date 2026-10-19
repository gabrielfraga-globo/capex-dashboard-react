import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
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
  /** Sem faixa superior: botão de ícone no canto. Não adiciona altura nem moldura própria (o conteúdo já é um card). */
  compact?: boolean;
}

export function FlipCard({
  front,
  back,
  frontLabel,
  backLabel,
  defaultSide = "front",
  className,
  compact = false,
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

  const alternar = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    focoPendente.current = true;
    setVirado((v) => !v);
  };

  const botao = compact ? (
    <button
      type="button"
      aria-pressed={virado}
      aria-label={`Ver ${outroLado}`}
      title={`Ver ${outroLado}`}
      onClick={alternar}
      className="absolute right-1.5 top-1.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full text-text-muted transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  ) : (
    <button
      type="button"
      aria-pressed={virado}
      onClick={alternar}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <RefreshCw size={13} aria-hidden="true" />
      <span>Ver {outroLado}</span>
    </button>
  );

  const conteudo = (
    <>
      {!compact && (
        <div className="flex items-center justify-between gap-2 px-4 pt-4">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            {ladoAtual}
          </span>
          {botao}
        </div>
      )}
      {compact && botao}

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
            "flip-face motion-reduce:transition-opacity motion-reduce:duration-150",
            !compact && "px-4 pb-4",
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
            "flip-face flip-face-back motion-reduce:transition-opacity motion-reduce:duration-150",
            !compact && "px-4 pb-4",
            versoOculto && "motion-reduce:opacity-0"
          )}
        >
          {back}
        </div>
      </div>
    </>
  );

  if (compact) {
    return <div className={cn("relative flip-perspective", className)}>{conteudo}</div>;
  }

  return <Card className={cn("flip-perspective p-0", className)}>{conteudo}</Card>;
}
