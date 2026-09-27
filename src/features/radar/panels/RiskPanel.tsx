/** Painel lateral: Projetos em risco de caixa (EM_RISCO). */
import { SidePanel } from "../../../components/ui/sidepanel";
import { fmtBRL } from "../../../lib/format";
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
    <SidePanel open={open} onOpenChange={onClose} title="Projetos em risco">
      <div className="p-4 flex flex-col h-full">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="py-2">Projeto</th>
                <th className="py-2">Plataforma (n4)</th>
                <th className="py-2">Gestor</th>
                <th className="py-2 text-right">RCs em risco</th>
                <th className="py-2 text-right">Valor em risco</th>
              </tr>
            </thead>
            <tbody>
              {risk.projects.map((p) => (
                <tr key={p.projectName} className="border-b border-border/50">
                  <td className="py-2 truncate max-w-[150px]" title={p.projectName}>{p.projectName}</td>
                  <td className="py-2 truncate max-w-[120px]" title={p.n4}>{p.n4}</td>
                  <td className="py-2 truncate max-w-[120px]">{p.platformManager || "—"}</td>
                  <td className="py-2 text-right">{p.rcCount}</td>
                  <td className="py-2 text-right">{fmtBRL(p.value)}</td>
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
