import { fmtBRL, fmtPct } from "../../lib/format";
import { SEM_PLATAFORMA, type ComposicaoPlataforma } from "./composicao";

interface Props {
  itens: ComposicaoPlataforma[];
  onSelectPlataforma?: (plataforma: string) => void;
  plataformaAtiva?: string | null;
  onLimparFiltros?: () => void;
}

const pct = (v: number) => `${v * 100}%`;

export function ComposicaoPlataformaChart({ itens, onSelectPlataforma, plataformaAtiva, onLimparFiltros }: Props) {
  // Escala comum: o maior comprometimento define 100% da largura; nunca menor que o BG (100%).
  const escala = Math.max(1, ...itens.map((i) => i.pctComprometido ?? 0));

  return (
    <>
      <div className="flex items-center justify-between shrink-0 mb-1 pr-8">
        <p data-flip-title className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
          Composição por plataforma
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-muted mb-2">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-info" aria-hidden />
          Caixa
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-violet-500/50" aria-hidden />
          Compromisso
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-risk-critico" aria-hidden />
          Acima do BG
        </span>
      </div>

      {itens.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center text-xs text-text-muted">
          <p>Nenhuma plataforma com dados nesta seleção.</p>
          {onLimparFiltros && (
            <button
              type="button"
              onClick={onLimparFiltros}
              className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-text hover:bg-card-alt"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-1 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
          {itens.map((item) => {
            const clicavel = !!onSelectPlataforma && item.plataforma !== SEM_PLATAFORMA;
            const ativa = plataformaAtiva === item.plataforma;
            const semBg = item.bg === 0;
            const caixaF = semBg ? 0 : item.caixa / item.bg;
            const comprometidoF = item.pctComprometido ?? 0;
            const caixaVisivel = Math.min(caixaF, 1);
            const compVisivel = semBg ? 0 : Math.max(0, Math.min(comprometidoF, 1) - caixaVisivel);
            const excessoVisivel = semBg ? 0 : Math.max(0, comprometidoF - 1);
            const semBgComValor = semBg && item.caixa + item.compromisso > 0;
            const rotulo = `${item.plataforma}: BG ${fmtBRL(item.bg)}, caixa ${fmtBRL(item.caixa)}, compromisso ${fmtBRL(item.compromisso)}${item.excesso > 0 ? `, acima do BG ${fmtBRL(item.excesso)}` : ""}`;

            return (
              <li key={item.plataforma}>
                <button
                  type="button"
                  disabled={!clicavel}
                  aria-pressed={clicavel ? ativa : undefined}
                  aria-label={rotulo}
                  onClick={() => onSelectPlataforma?.(item.plataforma)}
                  className={[
                    "grid w-full grid-cols-[150px_minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-2 py-1.5 text-left",
                    ativa ? "border-accent bg-card-alt" : "border-transparent",
                    clicavel ? "hover:bg-card-alt cursor-pointer" : "cursor-default opacity-80",
                  ].join(" ")}
                >
                  <span className="truncate text-xs font-medium text-text" title={item.plataforma}>
                    {item.plataforma}
                  </span>

                  <span className="relative block h-4" aria-hidden>
                    <span
                      className="absolute left-0 top-0 h-full rounded-sm border border-border bg-card-alt"
                      style={{ width: pct(1 / escala) }}
                    />
                    {caixaVisivel > 0 && (
                      <span className="absolute left-0 top-0 h-full rounded-l-sm bg-info" style={{ width: pct(caixaVisivel / escala) }} />
                    )}
                    {compVisivel > 0 && (
                      <span
                        className="absolute top-0 h-full bg-violet-500/50"
                        style={{ left: pct(caixaVisivel / escala), width: pct(compVisivel / escala) }}
                      />
                    )}
                    {semBgComValor && (
                      <span className="absolute left-0 top-0 h-full w-full rounded-sm bg-risk-critico" />
                    )}
                    {excessoVisivel > 0 && (
                      <span
                        className="absolute top-0 h-full rounded-r-sm bg-risk-critico"
                        style={{ left: pct(1 / escala), width: pct(excessoVisivel / escala) }}
                      />
                    )}
                    {!semBg && (
                      <span className="absolute -top-0.5 -bottom-0.5 w-px bg-text" style={{ left: pct(1 / escala) }} />
                    )}
                  </span>

                  <span className="flex flex-col items-end text-right">
                    <span className="whitespace-nowrap text-[11px] text-text-muted">
                      BG {fmtBRL(item.bg, true)} · {fmtPct(item.pctCaixa, 0)} em caixa
                    </span>
                    {item.excesso > 0 && (
                      <span className="whitespace-nowrap text-[11px] font-semibold text-risk-critico">
                        +{fmtBRL(item.excesso, true)} acima
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
