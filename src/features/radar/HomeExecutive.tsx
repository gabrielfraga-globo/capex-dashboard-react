import { useState, useMemo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Card } from "../../components/ui/primitives";
import { fmtBRL } from "../../lib/format";
import { navigate } from "../../lib/simpleRouter";
import { useCuration } from "./useCuration";
import { buildProjectBalances, summarizeBalances, buildProjectsAtRisk, buildCurationConsistency, sumProvisioned, buildBottleneck, buildInsights, buildBridge, type ProjectBalance, type Insight } from "./executive";
import { buildOperationalRows } from "./operational";
import { SidePanel } from "../../components/ui/sidepanel";
import type { ProjetoMetricas } from "../../types";
import { normalizeKey } from "../../lib/csvProcessingCore";

interface HomeExecutiveProps {
  lista: ProjetoMetricas[];
  dataBase: string | null;
  onSelectProject: (p: ProjetoMetricas) => void;
  /** gráfico de fluxo compacto, renderizado na faixa inferior direita */
  fluxo: ReactNode;
}

const M = (v: number) => (v / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (v: number) => `${Math.round(v * 100)}%`;
const DOT: Record<Insight["severity"], string> = { neutral: "bg-text-faint", info: "bg-info", warn: "bg-warn", crit: "bg-crit" };

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

export function HomeExecutive({ lista, dataBase, onSelectProject, fluxo }: HomeExecutiveProps) {
  const { isLoading: isLoadingCur, error: errCur, bundle, curationMap } = useCuration();

  const [panelOpen, setPanelOpen] = useState<"risk" | "balances" | "composicao" | null>(null);
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

    let residual = 0;
    let naoOcorre = 0;
    for (const r of opRows) {
      if (r.stage === "RESIDUAL" || r.stage === "DESCONHECIDA") residual += r.value;
      else if (r.classification === "NAO_OCORRE") naoOcorre += r.value;
    }
    const bridge = buildBridge({ bg: bgSistemico, realizado: totalRealizado, emPagamento: totalEmPagamento, prov26, provRisco, prov27, residual, naoOcorre, saldoLiquido: balanceSummary.liquido });
    const bottleneck = buildBottleneck(opRows);
    const pendente = Math.max(0, consistency.scopeValue - opRows.filter(r => r.isClassificationConfirmed).reduce((s, r) => s + r.value, 0));
    const insights = buildInsights({
      bgSistemico, projetado: projecao, realizado: totalRealizado, emPagamento: totalEmPagamento,
      projetosEmRiscoCount: risk.count, projetosEmRiscoValue: risk.totalValue, top10RiscoValue: risk.top10Value,
      dataBase: dbDate, opRows,
      saldoParadoValue: bundle.projectActivity ? balanceSummary.parado.value : 0,
      curadoriaPendenteValue: consistency.scopeCount > consistency.confirmed ? pendente : 0,
    });

    return {
      projectBalances,
      balanceSummary,
      risk,
      consistency,
      bridge,
      bottleneck,
      insights,
      totals: { totalRealizado, totalEmPagamento, realizadoMaisEmPgto, bgSistemico, prov26, provRisco, prov27, projecao, pctBg, projecaoComRisco, pctRisco, desvioA, desvioB }
    };
  }, [bundle, curationMap, lista, dataBase]);

  if (isLoadingCur) {
    return (
      <div className="h-full rounded-card border border-border bg-card-alt p-4 animate-pulse">
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

  const { balanceSummary, risk, consistency, totals, projectBalances, bridge, bottleneck, insights } = computed;
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

  const goTo = (t: Insight["target"]) => {
    if (t === "composicao") setPanelOpen("composicao");
    else if (t === "saldo") setPanelOpen("balances");
    else if (t === "risco") setPanelOpen("risk");
    else navigate("/radar");
  };
  const [resumo, ...destaques] = insights;
  const bg = totals.bgSistemico || 1;
  const w = (v: number) => `${Math.max(0, Math.min(100, (v / bg) * 100))}%`;
  const projPos = Math.min(100, (totals.projecao / bg) * 100);
  const faltam = Math.max(0, totals.bgSistemico - totals.projecao);
  const curPct = consistency.scopeCount ? consistency.confirmed / consistency.scopeCount : 0;
  const top5 = risk.projects.slice(0, 5);
  const topVal = top5[0]?.value || 1;
  const gargalo = bottleneck[0];

  return (
    <>
      <div className="flex flex-col gap-4 h-full min-h-0">
        {/* Insights */}
        <section aria-label="Insights executivos" className="rounded-card border border-border bg-card px-5 py-4 flex flex-col gap-3 shrink-0">
          <p className="text-lg font-medium leading-snug text-text">{resumo?.text}</p>
          {destaques.length > 0 && (
            <div className="grid gap-6 text-[13px] text-text-muted" style={{ gridTemplateColumns: `repeat(${Math.min(3, destaques.length)}, minmax(0, 1fr))` }}>
              {destaques.slice(0, 3).map((ins) => (
                <button key={ins.kind} type="button" onClick={() => goTo(ins.target)} className="flex gap-2.5 items-baseline text-left hover:text-text">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[ins.severity]}`} aria-hidden="true" />
                  <span>{ins.text} <span className="text-info">→</span></span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* KPI principal + secundários */}
        <div className="grid grid-cols-2 gap-4 shrink-0 max-lg:grid-cols-1">
          <section aria-label="Caixa projetado 2026" className="rounded-card border border-border bg-card px-6 py-5 flex flex-col gap-3">
            <div className="flex justify-between text-[13px] text-text-muted"><span className="font-semibold text-text">Caixa projetado 2026</span><span>tendência disponível após o snapshot semanal</span></div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-[44px] leading-none font-bold tabular-nums text-text">{fmtBRL(totals.projecao, true)}</span>
              <span className="text-sm text-text-muted">{pct(totals.pctBg)} do BG · faltam {fmtBRL(faltam, true)}</span>
            </div>
            <div className="relative mt-5" role="img" aria-label={`Realizado ${M(totals.totalRealizado)}, em processamento ${M(totals.totalEmPagamento)}, provisionado 26 ${M(totals.prov26)}, em risco ${M(totals.provRisco)} milhões, BG ${M(totals.bgSistemico)} milhões`}>
              <div className="flex h-[22px] rounded-sm overflow-hidden border border-dashed border-border">
                <div style={{ width: w(totals.totalRealizado), opacity: 0.95 }} className="bg-text-muted" />
                <div style={{ width: w(totals.totalEmPagamento), opacity: 0.6 }} className="bg-text-muted" />
                <div style={{ width: w(totals.prov26), opacity: 0.3 }} className="bg-text-muted" />
                <div style={{ width: w(totals.provRisco) }} className="bg-warn-30 shadow-[inset_0_0_0_1px_theme(colors.warn.DEFAULT)]" />
              </div>
              <div className="absolute -top-2 h-[38px] border-l-2 border-text" style={{ left: `${projPos}%` }} />
              <div className="absolute -top-2 right-0 h-[38px] border-l-2 border-text" />
              <div className="absolute -top-6 text-xs font-semibold -translate-x-1/2 whitespace-nowrap" style={{ left: `${projPos}%` }}>Projetado</div>
              <div className="absolute -top-6 right-0 text-xs font-semibold whitespace-nowrap">BG {M(totals.bgSistemico)}</div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
              <span><i className="inline-block w-2.5 h-2.5 bg-text-muted align-[-1px]" style={{ opacity: 0.95 }} /> Realizado {M(totals.totalRealizado)}</span>
              <span><i className="inline-block w-2.5 h-2.5 bg-text-muted align-[-1px]" style={{ opacity: 0.6 }} /> Em processamento {M(totals.totalEmPagamento)}</span>
              <span><i className="inline-block w-2.5 h-2.5 bg-text-muted align-[-1px]" style={{ opacity: 0.3 }} /> Provisionado 26 {M(totals.prov26)}</span>
              <span className="text-warn"><i className="inline-block w-2.5 h-2.5 bg-warn-30 align-[-1px] shadow-[inset_0_0_0_1px_theme(colors.warn.DEFAULT)]" /> Em risco {M(totals.provRisco)}</span>
            </div>
            <button type="button" className="text-[13px] text-info text-left hover:underline mt-auto" onClick={() => setPanelOpen("composicao")}>Ver composição (ponte do BG ao projetado) →</button>
          </section>

          <div className="grid grid-cols-3 gap-4">
            <SecondaryCard
              label="Em risco" alert={risk.totalValue > 0}
              value={fmtBRL(risk.totalValue, true)}
              context={`${risk.count} projetos · 10 concentram ${risk.totalValue ? pct(risk.top10Value / risk.totalValue) : "0%"}`}
              trend="Δ semana: —" action="Ver projetos →" onAction={() => setPanelOpen("risk")}
            />
            <SecondaryCard
              label="Saldo remanejável" alert={false}
              value={semAtividade ? "—" : fmtBRL(balanceSummary.parado.value, true)}
              context={semAtividade ? "movimentação por projeto indisponível nesta base" : `${balanceSummary.parado.count} projetos parados há mais de 60 dias`}
              trend="Δ semana: —" action="Ver saldos →" onAction={() => setPanelOpen("balances")}
            />
            <SecondaryCard
              label="Curadoria" alert={curPct < 0.5}
              value={`${consistency.confirmed} de ${consistency.scopeCount}`}
              context={`RCs do pareto confirmadas (${fmtBRL(consistency.scopeValue, true)})`}
              trend="Δ semana: —" action="Ir para curadoria →" onAction={() => navigate("/radar")}
            />
          </div>
        </div>

        {/* Problemas + fluxo */}
        <div className="grid grid-cols-12 gap-4 flex-1 min-h-0 max-lg:grid-cols-1">
          <section aria-label="Principais problemas" className="col-span-7 max-lg:col-span-1 rounded-card border border-border bg-card px-6 py-4 flex flex-col gap-2.5 min-h-0">
            <div className="flex justify-between items-baseline"><h2 className="text-[15px] font-semibold text-text">Principais problemas</h2><button type="button" className="text-[13px] text-info hover:underline" onClick={() => navigate("/radar")}>Abrir Radar →</button></div>
            <div className="grid grid-cols-[24px_1fr_140px_72px] gap-x-3 gap-y-2 text-[13px] items-center">
              <span className="text-xs text-text-faint">#</span><span className="text-xs text-text-faint">Projeto em risco</span><span className="text-xs text-text-faint">Valor em risco</span><span className="text-xs text-text-faint text-right">R$</span>
              {top5.map((p, i) => (
                <FragmentRow key={p.projectName} i={i + 1} name={p.projectName} width={`${(p.value / topVal) * 100}%`} value={`${M(p.value)}M`} />
              ))}
            </div>
            <div className="mt-auto pt-2.5 border-t border-border flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-text-muted">
              {gargalo && <span>Onde trava: <strong className="text-text">{gargalo.stage} · {gargalo.area}</strong> {fmtBRL(gargalo.value, true)} · {gargalo.rcCount} RCs</span>}
              {!semAtividade && <span>Saldo parado: <strong className="text-text">{balanceSummary.parado.count} projetos</strong> {fmtBRL(balanceSummary.parado.value, true)}</span>}
            </div>
          </section>
          <div className="col-span-5 max-lg:col-span-1 min-h-0 flex flex-col max-lg:h-[320px]">{fluxo}</div>
        </div>
      </div>

      {panelOpen === "composicao" && (
        <SidePanel open={true} onOpenChange={() => setPanelOpen(null)} title="Do BG ao caixa projetado">
          <div className="p-4 flex flex-col gap-3">
            <p className="text-xs text-text-faint">Valores em R$ milhões, com os filtros ativos.</p>
            <table className="w-full text-sm">
              <tbody>
                {bridge.steps.map((s) => (
                  <tr key={s.label} className={`border-b border-border/50 ${s.kind === "result" ? "font-semibold" : ""}`}>
                    <td className="py-2">{s.kind === "minus" ? "− " : s.kind === "result" ? "= " : s.kind === "diff" ? "± " : ""}{s.label}</td>
                    <td className="py-2 text-right tabular-nums">{M(s.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {Math.abs(bridge.diferenca) >= 10_000 && (
              <p className="text-xs text-text-muted">A diferença entre bases vem do compromisso da carteira não bater com a soma das RCs do Radar para os projetos filtrados.</p>
            )}
          </div>
        </SidePanel>
      )}

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

function SecondaryCard({ label, alert, value, context, trend, action, onAction }: { label: string; alert: boolean; value: string; context: string; trend: string; action: string; onAction: () => void }) {
  return (
    <section aria-label={label} className="rounded-card border border-border bg-card p-5 flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-text">{alert && <span className="w-2 h-2 rounded-full bg-warn" aria-label="atenção" />}{label}</div>
      <div className="text-[26px] font-semibold tabular-nums text-text leading-tight">{value}</div>
      <div className="text-[13px] text-text-muted leading-snug">{context}</div>
      <div className="text-xs text-text-faint">{trend}</div>
      <button type="button" className="text-[13px] text-info text-left hover:underline mt-auto" onClick={onAction}>{action}</button>
    </section>
  );
}

function FragmentRow({ i, name, width, value }: { i: number; name: string; width: string; value: string }) {
  return (
    <>
      <span className="text-text-faint">{i}</span>
      <span className="truncate text-text" title={name}>{name}</span>
      <span><span className="block h-2 rounded-sm bg-text-muted" style={{ width, opacity: 0.35 }} /></span>
      <span className="text-right tabular-nums text-text">{value}</span>
    </>
  );
}
