import { useState, useMemo } from "react";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { Card } from "../../components/ui/primitives";
import { fmtBRL, fmtPct } from "../../lib/format";
import { navigate } from "../../lib/simpleRouter";
import { useCuration } from "./useCuration";
import { buildProjectBalances, summarizeBalances, buildProjectsAtRisk, buildCurationConsistency, sumProvisioned, type ProjectBalance } from "./executive";
import { buildOperationalRows } from "./operational";
import { SidePanel } from "../../components/ui/sidepanel";
import type { ProjetoMetricas } from "../../types";
import { normalizeKey } from "../../lib/csvProcessingCore";

interface ExecutiveCashSummaryProps {
  lista: ProjetoMetricas[];
  dataBase: string | null;
  onSelectProject: (p: ProjetoMetricas) => void;
}

function parseDateBR(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(parsed.getTime()) || parsed.getFullYear() !== Number(year) || parsed.getMonth() !== Number(month) - 1 || parsed.getDate() !== Number(day)) {
    return null;
  }
  return parsed;
}

function exportCsv(filename: string, rows: ProjectBalance[]) {
  const header = "Projeto;Plataforma (n4);Gestor;BG 2026;Executado;Comprometido;Saldo;Ultima mov.;Dias\n";
  const lines = rows.map(r => {
    const nome = `"${r.projectName.replace(/"/g, '""')}"`;
    const n4 = `"${r.n4Curta.replace(/"/g, '""')}"`;
    const gestor = r.gestor ? `"${r.gestor.replace(/"/g, '""')}"` : "";
    const bg = r.orcamento2026.toString().replace(".", ",");
    const executado = r.executado.toString().replace(".", ",");
    const comp = r.compromisso.toString().replace(".", ",");
    const saldo = r.saldo.toString().replace(".", ",");
    
    let tipo = "";
    if (r.lastMovementType === "PAGAMENTO") tipo = "Pagamento";
    else if (r.lastMovementType === "RC_APROVADA") tipo = "RC aprovada";
    else if (r.lastMovementType === "COMPROMISSO") tipo = "Compromisso";

    const dt = r.lastMovementAt ? r.lastMovementAt.split("-").reverse().join("/") : "";
    const mov = dt ? `"${dt} - ${tipo}"` : "Nunca";
    const dias = r.daysSinceMovement ?? "";

    return `${nome};${n4};${gestor};${bg};${executado};${comp};${saldo};${mov};${dias}`;
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

export function ExecutiveCashSummary({ lista, dataBase, onSelectProject }: ExecutiveCashSummaryProps) {
  const { isLoading: isLoadingCur, error: errCur, bundle, curationMap } = useCuration();

  const [panelOpen, setPanelOpen] = useState<"risk" | "balances" | null>(null);
  const [balanceTab, setBalanceTab] = useState<"parados" | "ativos" | "acima">("parados");

  const computed = useMemo(() => {
    if (!bundle) return null;
    const dbDate = parseDateBR(dataBase) || new Date();
    const referenceDateStr = dbDate.toISOString().slice(0, 10);
    
    // 1. Saldos
    const projectBalances = buildProjectBalances(lista, bundle.projectActivity, dbDate);
    const balanceSummary = summarizeBalances(projectBalances);

    // 2. Risco & Consistência filtrado pelos projetos da lista
    const validKeys = new Set(lista.map(p => `${normalizeKey(p.n4)}|${normalizeKey(p.nome)}`));
    
    const allOpRows = buildOperationalRows(bundle, curationMap, referenceDateStr);
    const opRows = allOpRows.filter(row => {
      const commitments = bundle.commitments.filter((c: any) => c.rc === row.rc);
      return commitments.some((c: any) => validKeys.has(`${normalizeKey(c.n4)}|${normalizeKey(c.projectName)}`));
    });

    const risk = buildProjectsAtRisk(opRows);
    const consistency = buildCurationConsistency(opRows, dbDate, bundle.exerciseYear);

    // 3. Totais da lista
    let totalRealizado = 0;
    let totalEmPagamento = 0;
    let bgSistemico = 0;
    for (const p of lista) {
      totalRealizado += p.realizado2026 ?? 0;
      totalEmPagamento += p.emPagamento2026 ?? 0;
      bgSistemico += p.orcamento2026 ?? 0;
    }
    const realizadoMaisEmPgto = totalRealizado + totalEmPagamento;
    
    // 4. Valores do pipeline Radar
    const { prov26, provRisco, prov27 } = sumProvisioned(opRows);

    const projecao = realizadoMaisEmPgto + prov26;
    const pctBg = bgSistemico ? projecao / bgSistemico : 0;
    
    const projecaoComRisco = projecao + provRisco;
    const pctRisco = bgSistemico ? projecaoComRisco / bgSistemico : 0;
    
    const desvioA = projecao - bgSistemico;
    const desvioB = projecaoComRisco - bgSistemico;

    return {
      projectBalances,
      balanceSummary,
      risk,
      consistency,
      totals: { totalRealizado, totalEmPagamento, realizadoMaisEmPgto, bgSistemico, prov26, provRisco, prov27, projecao, pctBg, projecaoComRisco, pctRisco, desvioA, desvioB }
    };
  }, [bundle, curationMap, lista, dataBase]);

  if (isLoadingCur) {
    return (
      <div className="mb-4 rounded-card border border-border bg-card-alt p-4 animate-pulse">
        <div className="h-4 w-32 rounded bg-card mb-3" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 rounded-card bg-card" />)}
        </div>
      </div>
    );
  }

  if (errCur || !bundle || !computed) {
    return (
      <div className="mb-4">
        <Card className="border-risk-critico">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 text-risk-critico" size={16} />
            <div>
              <div className="text-sm font-semibold text-risk-critico">Não foi possível carregar o risco de caixa</div>
              <div className="text-xs text-text-muted mt-1">{errCur ?? "Dados indisponíveis."}</div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const { balanceSummary, risk, consistency, totals, projectBalances } = computed;
  // sem projectActivity todo saldo positivo cairia em PARADO; não exibir número enganoso
  const semAtividade = !bundle.projectActivity;

  const handleRowClick = (key: string) => {
    const proj = lista.find(p => p.id === key);
    if (proj) {
      onSelectProject(proj);
      setPanelOpen(null);
    }
  };

  const getFilteredBalances = () => {
    if (balanceTab === "parados") return projectBalances.filter(p => p.group === "PARADO").sort((a,b) => Math.abs(b.saldo) - Math.abs(a.saldo));
    if (balanceTab === "ativos") return projectBalances.filter(p => p.group === "ATIVO_COM_SALDO").sort((a,b) => Math.abs(b.saldo) - Math.abs(a.saldo));
    return projectBalances.filter(p => p.group === "ACIMA_BG").sort((a,b) => Math.abs(b.saldo) - Math.abs(a.saldo));
  };

  return (
    <>
      <div className="mb-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          
          {/* Card 1: Projeção de caixa 2026 */}
          <div className="rounded-card border border-border bg-card p-4 shadow-sm flex flex-col justify-between">
            <div>
              <div className="text-xs font-semibold uppercase text-text-muted mb-1">Projeção de caixa 2026</div>
              <div className="text-2xl font-bold text-text">
                {fmtBRL(totals.projecao, true)}
                <span className="text-sm font-normal text-text-faint ml-2">({fmtPct(totals.pctBg)} do BG)</span>
              </div>
            </div>
            <div className="mt-3 text-xs text-text-faint space-y-1">
              <div>Se o provisionado em risco se confirmar: {fmtBRL(totals.projecaoComRisco, true)} ({fmtPct(totals.pctRisco)})</div>
              <div>Desvio frente ao BG: {fmtBRL(totals.desvioA, true)} a {fmtBRL(totals.desvioB, true)}</div>
            </div>
          </div>

          {/* Card 2: Projetos em risco */}
          <div className="rounded-card border border-border bg-card p-4 shadow-sm flex flex-col justify-between">
            <div>
              <div className="text-xs font-semibold uppercase text-text-muted mb-1">Projetos em risco</div>
              <div className="text-2xl font-bold text-risk-critico">
                {fmtBRL(risk.totalValue, true)}
                <span className="text-sm font-normal text-text-faint ml-2">em {risk.count} projetos</span>
              </div>
            </div>
            <div className="mt-3 text-xs text-text-faint space-y-1">
              <div>10 projetos concentram {fmtBRL(risk.top10Value, true)}:</div>
              <div className="truncate">{risk.projects.slice(0, 3).map(p => `${p.projectName} (${(p.value/1e6).toFixed(1)}M)`).join(", ")}{risk.projects.length > 3 ? "..." : ""}</div>
              <button className="text-brand hover:underline font-medium mt-1 flex items-center" onClick={() => setPanelOpen("risk")}>
                Ver os {risk.count} projetos <ArrowRight size={12} className="ml-1" />
              </button>
            </div>
          </div>

          {/* Card 3: Saldo remanejável */}
          <div className="rounded-card border border-border bg-card p-4 shadow-sm flex flex-col justify-between">
            <div>
              <div className="text-xs font-semibold uppercase text-text-muted mb-1">Saldo remanejável</div>
              {semAtividade ? (
                <div className="text-sm text-amber-500">Movimentação por projeto indisponível nesta base (regere o bundle com npm run prebuild).</div>
              ) : (
              <div className="text-2xl font-bold text-text">
                {fmtBRL(balanceSummary.parado.value, true)}
                <span className="text-sm font-normal text-text-faint ml-2">({balanceSummary.parado.count} parados)</span>
              </div>
              )}
            </div>
            <div className="mt-3 text-xs text-text-faint space-y-1">
              <div>Ativos com saldo · confirmar {fmtBRL(balanceSummary.ativo.value, true)} · {balanceSummary.ativo.count}</div>
              <div>Não é saldo · atraso (provisionado 27) {fmtBRL(totals.prov27, true)}</div>
              <div>Acima do BG (podem absorver) {fmtBRL(Math.abs(balanceSummary.acimaBg.value), true)} · {balanceSummary.acimaBg.count}</div>
              <button className="text-brand hover:underline font-medium mt-1 flex items-center" onClick={() => setPanelOpen("balances")}>
                Ver projetos com saldo <ArrowRight size={12} className="ml-1" />
              </button>
            </div>
          </div>

          {/* Card 4: Consistência da curadoria */}
          <div className="rounded-card border border-border bg-card p-4 shadow-sm flex flex-col justify-between">
            <div>
              <div className="text-xs font-semibold uppercase text-text-muted mb-1">Consistência da curadoria</div>
              <div className="text-2xl font-bold text-text">
                {consistency.confirmed} de {consistency.scopeCount} <span className="text-sm font-normal text-text-faint">RCs confirmadas</span>
              </div>
              <div className="mt-2 h-1.5 w-full bg-border rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${consistency.scopeCount ? (consistency.confirmed/consistency.scopeCount)*100 : 0}%` }} />
              </div>
            </div>
            <div className="mt-3 text-xs text-text-faint space-y-1">
              <div>Escopo: pareto de {fmtBRL(consistency.scopeValue, true)} (80% do comprometido em aberto)</div>
              <div className={consistency.divergent > 0 ? "text-amber-500" : ""}>Decisão diverge da esteira: {consistency.divergent}</div>
              <div className={consistency.expired > 0 ? "text-red-500" : ""}>Data esperada vencida: {consistency.expired}</div>
            </div>
          </div>
        </div>

        {/* Barra de composição */}
        <div className="h-4 w-full flex rounded-sm overflow-hidden text-[10px] text-white font-bold text-center leading-4 mb-2">
          {totals.bgSistemico > 0 && (
            <>
              <div style={{ width: `${(totals.totalRealizado / totals.bgSistemico) * 100}%` }} className="bg-emerald-700" title="Realizado" />
              <div style={{ width: `${(totals.totalEmPagamento / totals.bgSistemico) * 100}%` }} className="bg-emerald-500" title="Em processamento" />
              <div style={{ width: `${(totals.prov26 / totals.bgSistemico) * 100}%` }} className="bg-emerald-300" title="Provisionado 26" />
              <div style={{ width: `${(totals.provRisco / totals.bgSistemico) * 100}%` }} className="bg-amber-400" title="Provisionado em risco" />
              <div style={{ width: `${(totals.prov27 / totals.bgSistemico) * 100}%` }} className="bg-purple-400" title="Provisionado 27" />
              <div style={{ width: `${(Math.max(0, balanceSummary.liquido) / totals.bgSistemico) * 100}%` }} className="bg-gray-300 text-gray-700" title="Saldo líquido a emitir" />
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted px-1">
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-700" /> Realizado: {fmtBRL(totals.totalRealizado, true)}</div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Em processamento: {fmtBRL(totals.totalEmPagamento, true)}</div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-300" /> Provisionado 26: {fmtBRL(totals.prov26, true)}</div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> Em risco: {fmtBRL(totals.provRisco, true)}</div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-purple-400" /> Provisionado 27: {fmtBRL(totals.prov27, true)}</div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-gray-300" /> Saldo a emitir: {fmtBRL(Math.max(0, balanceSummary.liquido), true)}</div>
        </div>
      </div>

      {panelOpen === "risk" && (
        <SidePanel open={true} onOpenChange={() => setPanelOpen(null)} title="Projetos em risco">
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
                  {risk.projects.map(p => (
                    <tr key={p.projectName} className="border-b border-border/50">
                      <td className="py-2 truncate max-w-[150px]" title={p.projectName}>{p.projectName}</td>
                      <td className="py-2 truncate max-w-[120px]" title={p.n4}>{p.n4}</td>
                      <td className="py-2 truncate max-w-[120px]">{p.platformManager || "-"}</td>
                      <td className="py-2 text-right">{p.rcCount}</td>
                      <td className="py-2 text-right">{fmtBRL(p.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 border-t border-border pt-4 flex items-center justify-between">
              <div className="font-bold">Total: {fmtBRL(risk.totalValue)}</div>
              <button
                className="bg-brand text-white px-4 py-2 rounded-md hover:bg-brand/90 transition-colors"
                onClick={() => navigate('/radar')}
              >
                Abrir Radar
              </button>
            </div>
          </div>
        </SidePanel>
      )}

      {panelOpen === "balances" && (
        <SidePanel open={true} onOpenChange={() => setPanelOpen(null)} title="Saldo por projeto">
          <div className="flex flex-col h-full">
            <div className="border-b border-border flex px-4 pt-2">
              <button
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${balanceTab === 'parados' ? 'border-brand text-brand' : 'border-transparent text-text-muted hover:text-text'}`}
                onClick={() => setBalanceTab('parados')}
              >
                Parados ({balanceSummary.parado.count} · {fmtBRL(balanceSummary.parado.value, true)})
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${balanceTab === 'ativos' ? 'border-brand text-brand' : 'border-transparent text-text-muted hover:text-text'}`}
                onClick={() => setBalanceTab('ativos')}
              >
                Ativos com saldo ({balanceSummary.ativo.count} · {fmtBRL(balanceSummary.ativo.value, true)})
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${balanceTab === 'acima' ? 'border-brand text-brand' : 'border-transparent text-text-muted hover:text-text'}`}
                onClick={() => setBalanceTab('acima')}
              >
                Acima do BG ({balanceSummary.acimaBg.count} · {fmtBRL(Math.abs(balanceSummary.acimaBg.value), true)})
              </button>
            </div>
            
            <div className="p-4 flex-1 overflow-auto">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-text-faint max-w-lg">
                  {balanceTab === "parados" && "Saldo parado: sem pagamento, RC ou compromisso novo há mais de 60 dias."}
                  {balanceTab === "ativos" && "Ativos com saldo: tiveram movimentação nos últimos 60 dias, pendentes de confirmação."}
                  {balanceTab === "acima" && "Acima do BG: projetos que já consumiram todo o orçamento aprovado."}
                </p>
                <button
                  className="text-xs font-medium text-brand hover:underline"
                  onClick={() => exportCsv(`saldo-${balanceTab}-${new Date().toISOString().slice(0,10)}.csv`, getFilteredBalances())}
                >
                  Exportar CSV
                </button>
              </div>

              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-border text-text-muted text-xs">
                    <th className="py-2 font-medium">Projeto</th>
                    <th className="py-2 font-medium">Plataforma (n4)</th>
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
                  {getFilteredBalances().map(p => {
                    let tipo = "";
                    if (p.lastMovementType === "PAGAMENTO") tipo = "Pagamento";
                    else if (p.lastMovementType === "RC_APROVADA") tipo = "RC aprovada";
                    else if (p.lastMovementType === "COMPROMISSO") tipo = "Compromisso";
                    
                    return (
                      <tr key={p.projectKey} className="border-b border-border/50 cursor-pointer hover:bg-card-alt transition-colors" onClick={() => handleRowClick(p.projectKey)}>
                        <td className="py-2 truncate max-w-[150px]" title={p.projectName}>{p.projectName}</td>
                        <td className="py-2 truncate max-w-[100px]" title={p.n4Curta}>{p.n4Curta}</td>
                        <td className="py-2 truncate max-w-[100px]">{p.gestor || "-"}</td>
                        <td className="py-2 text-right">{fmtBRL(p.orcamento2026)}</td>
                        <td className="py-2 text-right">{fmtBRL(p.executado)}</td>
                        <td className="py-2 text-right">{fmtBRL(p.compromisso)}</td>
                        <td className="py-2 text-right font-medium">{fmtBRL(p.saldo)}</td>
                        <td className="py-2 text-right text-xs">
                          {p.lastMovementAt ? `${p.lastMovementAt.split("-").reverse().join("/")} - ${tipo}` : "Nunca"}
                        </td>
                        <td className="py-2 text-right">{p.daysSinceMovement ?? "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border p-4 font-bold text-sm text-right">
              Total da aba: {fmtBRL(
                balanceTab === 'parados' ? balanceSummary.parado.value :
                balanceTab === 'ativos' ? balanceSummary.ativo.value :
                balanceSummary.acimaBg.value
              )}
            </div>
          </div>
        </SidePanel>
      )}
    </>
  );
}
