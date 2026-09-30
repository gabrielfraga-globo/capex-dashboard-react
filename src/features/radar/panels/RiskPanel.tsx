/** Painel lateral: Projetos em risco de caixa (EM_RISCO). */
import { SidePanel } from "../../../components/ui/sidepanel";
import { fmtBRL } from "../../../lib/format";
import { n4Curta } from "../../../lib/csvProcessingCore";
import { navigate } from "../../../lib/simpleRouter";
import type { buildProjectsAtRisk } from "../executive";

type RiskData = ReturnType<typeof buildProjectsAtRisk>;

export function RiskPanel({
  open,
  onClose,
  risk,
}: {
  open: boolean;
  onClose: () => void;
  risk: RiskData;
}) {
  return (
    <SidePanel open={open} onOpenChange={onClose} title="Projetos em risco" className="!max-w-[min(1100px,92vw)]">
      <div className="p-4 flex flex-col h-full">
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="py-3">Projeto</th>
                <th className="py-3">Plataforma</th>
                <th className="py-3">Gestor</th>
                <th className="py-3 text-right">RCs</th>
                <th className="py-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {risk.projects.map((p) => (
                <tr key={p.projectName} className="border-b border-border/50">
                  <td className="py-3 pr-4 max-w-[260px]" title={p.projectName}><div className="line-clamp-2 break-words whitespace-normal">{p.projectName}</div></td>
                  <td className="py-3 truncate max-w-[160px]" title={p.n4}>{n4Curta(p.n4)}</td>
                  <td className="py-3 truncate max-w-[120px]">{p.platformManager || "—"}</td>
                  <td className="py-3 text-right tabular-nums">{p.rcCount}</td>
                  <td className="py-3 text-right tabular-nums">{fmtBRL(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 border-t border-border pt-4 flex items-center justify-between">
          <div className="font-bold text-sm">Total: {fmtBRL(risk.totalValue)}</div>
          <button
            className="text-[13px] text-info hover:underline"
            onClick={() => navigate("/radar")}
          >
            Abrir Radar →
          </button>
        </div>
      </div>
    </SidePanel>
  );
}
