/** Painel lateral: Ponte do BG ao caixa projetado. */
import { SidePanel } from "../../../components/ui/sidepanel";
import type { buildBridge } from "../executive";

type Bridge = ReturnType<typeof buildBridge>;
const M = (v: number) => (v / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function BridgePanel({
  open,
  onClose,
  bridge,
}: {
  open: boolean;
  onClose: () => void;
  bridge: Bridge;
}) {
  return (
    <SidePanel open={open} onOpenChange={onClose} title="Do BG ao caixa projetado">
      <div className="p-4 flex flex-col gap-3">
        <p className="text-xs text-text-faint">Valores em R$ milhões, com os filtros ativos.</p>
        <table className="w-full text-sm">
          <tbody>
            {bridge.steps.map((s) => (
              <tr
                key={s.label}
                className={`border-b border-border/50 ${s.kind === "result" ? "font-semibold" : ""}`}
              >
                <td className="py-2">
                  {s.kind === "minus" ? "− " : s.kind === "result" ? "= " : s.kind === "diff" ? "± " : ""}
                  {s.label}
                </td>
                <td className="py-2 text-right tabular-nums">{M(s.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {Math.abs(bridge.diferenca) >= 10_000 && (
          <p className="text-xs text-text-muted">
            A diferença entre bases vem do compromisso da carteira não bater com a soma das RCs do Radar para os
            projetos filtrados.
          </p>
        )}
      </div>
    </SidePanel>
  );
}
