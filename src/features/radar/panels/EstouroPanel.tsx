import { SidePanel } from "../../../components/ui/sidepanel";
import { fmtBRL } from "../../../lib/format";
import type { EstouroProjeto } from "../executive";

export function EstouroPanel({
  open,
  onClose,
  estouro,
}: {
  open: boolean;
  onClose: () => void;
  estouro: { count: number; value: number; projetos: EstouroProjeto[] };
}) {
  return (
    <SidePanel open={open} onOpenChange={onClose} title="Projetos em estouro" className="!max-w-[min(1100px,92vw)]">
      <div className="p-4 flex flex-col h-full">
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="py-2">Projeto</th>
                <th className="py-2">Plataforma</th>
                <th className="py-2">Gestor</th>
                <th className="py-2 text-right">BG</th>
                <th className="py-2 text-right">Consumido</th>
                <th className="py-2 text-right">Estouro</th>
              </tr>
            </thead>
            <tbody>
              {estouro.projetos.map((p) => {
                const consumido = p.realizado + p.emPagamento + p.compromisso;
                return (
                  <tr key={p.projectName} className="border-b border-border/50">
                    <td className="py-2 truncate max-w-[150px]" title={p.projectName}>{p.projectName}</td>
                    <td className="py-2 truncate max-w-[160px]" title={p.n4Curta}>{p.n4Curta}</td>
                    <td className="py-2 truncate max-w-[100px]">{p.gestor || "—"}</td>
                    <td className="py-2 text-right">{fmtBRL(p.bg)}</td>
                    <td className="py-2 text-right">{fmtBRL(consumido)}</td>
                    <td className="py-2 text-right text-crit font-medium">{fmtBRL(p.estouro)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 border-t border-border pt-4 flex items-center justify-between">
          <div className="font-bold text-sm text-crit">Total estourado: {fmtBRL(estouro.value)}</div>
        </div>
      </div>
    </SidePanel>
  );
}
