/** Painel lateral: Saldo por projeto (parados / ativos / acima do BG). */
import { useState } from "react";
import { SidePanel } from "../../../components/ui/sidepanel";
import { fmtBRL } from "../../../lib/format";
import type { ProjectBalance, summarizeBalances } from "../executive";

type BalanceSummary = ReturnType<typeof summarizeBalances>;
type Tab = "parados" | "ativos" | "acima";

function exportCsv(filename: string, rows: ProjectBalance[]) {
  const header = "Projeto;Plataforma (n4);Gestor;BG 2026;Executado;Comprometido;Saldo;Ultima mov.;Dias\n";
  const lines = rows.map((r) => {
    const nome = `"${r.projectName.replace(/"/g, '""')}"`;
    const n4 = `"${r.n4Curta.replace(/"/g, '""')}"`;
    const gestor = r.gestor ? `"${r.gestor.replace(/"/g, '""')}"` : "";
    let tipo = "";
    if (r.lastMovementType === "PAGAMENTO") tipo = "Pagamento";
    else if (r.lastMovementType === "RC_APROVADA") tipo = "RC aprovada";
    else if (r.lastMovementType === "COMPROMISSO") tipo = "Compromisso";
    const dt = r.lastMovementAt ? r.lastMovementAt.split("-").reverse().join("/") : "";
    const mov = dt ? `"${dt} - ${tipo}"` : "Nunca";
    return `${nome};${n4};${gestor};${r.orcamento2026};${r.executado};${r.compromisso};${r.saldo};"${mov}";${r.daysSinceMovement ?? ""}`;
  });
  const blob = new Blob(["\uFEFF" + header + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function BalancesPanel({
  open,
  onClose,
  projectBalances,
  balanceSummary,
  onSelectProject,
}: {
  open: boolean;
  onClose: () => void;
  projectBalances: ProjectBalance[];
  balanceSummary: BalanceSummary;
  onSelectProject: (key: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("parados");

  const getRows = () => {
    const sort = (arr: ProjectBalance[]) => [...arr].sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo));
    if (tab === "parados") return sort(projectBalances.filter((p) => p.group === "PARADO"));
    if (tab === "ativos") return sort(projectBalances.filter((p) => p.group === "ATIVO_COM_SALDO"));
    return sort(projectBalances.filter((p) => p.group === "ACIMA_BG"));
  };

  const tabTotal =
    tab === "parados" ? balanceSummary.parado.value :
    tab === "ativos" ? balanceSummary.ativo.value :
    balanceSummary.acimaBg.value;

  const tabBtn = (t: Tab, label: string) => (
    <button
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-accent text-accent" : "border-transparent text-text-muted hover:text-text"}`}
      onClick={() => setTab(t)}
    >
      {label}
    </button>
  );

  return (
    <SidePanel open={open} onOpenChange={onClose} title="Saldo por projeto">
      <div className="flex flex-col h-full">
        <div className="border-b border-border flex px-4 pt-2">
          {tabBtn("parados", `Parados (${balanceSummary.parado.count} · ${fmtBRL(balanceSummary.parado.value, true)})`)}
          {tabBtn("ativos", `Ativos com saldo (${balanceSummary.ativo.count} · ${fmtBRL(balanceSummary.ativo.value, true)})`)}
          {tabBtn("acima", `Acima do BG (${balanceSummary.acimaBg.count} · ${fmtBRL(Math.abs(balanceSummary.acimaBg.value), true)})`)}
        </div>
        <div className="p-4 flex-1 overflow-auto">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-text-faint max-w-lg">
              {tab === "parados" && "Saldo parado: sem pagamento, RC ou compromisso novo há mais de 60 dias."}
              {tab === "ativos" && "Ativos com saldo: tiveram movimentação nos últimos 60 dias, pendentes de confirmação."}
              {tab === "acima" && "Acima do BG: projetos que já consumiram todo o orçamento aprovado."}
            </p>
            <button
              className="text-xs font-medium text-info hover:underline"
              onClick={() => exportCsv(`saldo-${tab}-${new Date().toISOString().slice(0, 10)}.csv`, getRows())}
            >
              Exportar CSV
            </button>
          </div>
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-border text-text-muted text-xs">
                <th className="py-2 font-medium">Projeto</th>
                <th className="py-2 font-medium">Plataforma</th>
                <th className="py-2 font-medium">Gestor</th>
                <th className="py-2 font-medium text-right">BG 2026</th>
                <th className="py-2 font-medium text-right">Executado</th>
                <th className="py-2 font-medium text-right">Comprometido</th>
                <th className="py-2 font-medium text-right">Saldo</th>
                <th className="py-2 font-medium text-right">Última mov.</th>
                <th className="py-2 font-medium text-right">Dias</th>
              </tr>
            </thead>
            <tbody>
              {getRows().map((p) => {
                let tipo = "";
                if (p.lastMovementType === "PAGAMENTO") tipo = "Pagamento";
                else if (p.lastMovementType === "RC_APROVADA") tipo = "RC aprovada";
                else if (p.lastMovementType === "COMPROMISSO") tipo = "Compromisso";
                return (
                  <tr
                    key={p.projectKey}
                    className="border-b border-border/50 cursor-pointer hover:bg-card-alt transition-colors"
                    onClick={() => onSelectProject(p.projectKey)}
                  >
                    <td className="py-2 truncate max-w-[150px]" title={p.projectName}>{p.projectName}</td>
                    <td className="py-2 truncate max-w-[100px]" title={p.n4Curta}>{p.n4Curta}</td>
                    <td className="py-2 truncate max-w-[100px]">{p.gestor || "—"}</td>
                    <td className="py-2 text-right">{fmtBRL(p.orcamento2026)}</td>
                    <td className="py-2 text-right">{fmtBRL(p.executado)}</td>
                    <td className="py-2 text-right">{fmtBRL(p.compromisso)}</td>
                    <td className="py-2 text-right font-medium">{fmtBRL(p.saldo)}</td>
                    <td className="py-2 text-right text-xs">
                      {p.lastMovementAt ? `${p.lastMovementAt.split("-").reverse().join("/")} - ${tipo}` : "Nunca"}
                    </td>
                    <td className="py-2 text-right">{p.daysSinceMovement ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border p-4 font-bold text-sm text-right">
          Total da aba: {fmtBRL(tabTotal)}
        </div>
      </div>
    </SidePanel>
  );
}
