import type { ProjetoBase } from "../../types/index.js";
import type { CommitmentSourceBundle } from "./types";
import type { OperationalRow } from "./operational";
import { suggestClassification } from "./operational";

export const STALE_DAYS = 60;

export interface ProjectBalance {
  projectKey: string;
  projectName: string;
  n4Curta: string;
  n4: string;
  gestor: string | null;
  saldo: number;
  orcamento2026: number;
  realizado2026: number;
  emPagamento2026: number;
  executado: number;
  compromisso: number;
  lastMovementAt: string | null;
  lastMovementType: 'PAGAMENTO' | 'RC_APROVADA' | 'COMPROMISSO' | null;
  daysSinceMovement: number | null;
  group: 'PARADO' | 'ATIVO_COM_SALDO' | 'ACIMA_BG';
}

function parseDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}

function diffDays(start: string, end: Date) {
  const startDate = parseDate(start);
  return Math.floor((end.getTime() - startDate.getTime()) / (1000 * 3600 * 24));
}

export function buildProjectBalances(
  projetos: ProjetoBase[],
  activity: CommitmentSourceBundle["projectActivity"],
  dataBase: Date
): ProjectBalance[] {
  const res: ProjectBalance[] = [];
  const actMap = new Map(activity?.map(a => [a.projectKey, a]) || []);

  for (const p of projetos) {
    const orcamento2026 = p.orcamento2026 ?? 0;
    const realizado2026 = p.realizado2026 ?? 0;
    const emPagamento2026 = p.emPagamento2026 ?? 0;
    const compromisso = p.compromisso ?? 0;
    const saldo = orcamento2026 - realizado2026 - emPagamento2026 - compromisso;

    if (Math.abs(saldo) < 0.01) continue;

    const act = actMap.get(p.id);
    let lastMovementAt: string | null = null;
    let lastMovementType: 'PAGAMENTO' | 'RC_APROVADA' | 'COMPROMISSO' | null = null;

    if (act) {
      const dates = [
        { d: act.lastPaymentAt, t: 'PAGAMENTO' as const },
        { d: act.lastRcApprovedAt, t: 'RC_APROVADA' as const },
        { d: act.lastCommitmentCreatedAt, t: 'COMPROMISSO' as const }
      ].filter(x => x.d !== null) as { d: string, t: any }[];
      
      if (dates.length > 0) {
        dates.sort((a, b) => b.d.localeCompare(a.d));
        lastMovementAt = dates[0].d;
        lastMovementType = dates[0].t;
      }
    }

    const daysSinceMovement = lastMovementAt ? diffDays(lastMovementAt, dataBase) : null;
    let group: 'PARADO' | 'ATIVO_COM_SALDO' | 'ACIMA_BG';
    if (saldo < 0) {
      group = 'ACIMA_BG';
    } else if (lastMovementAt === null || (daysSinceMovement !== null && daysSinceMovement > STALE_DAYS)) {
      group = 'PARADO';
    } else {
      group = 'ATIVO_COM_SALDO';
    }

    res.push({
      projectKey: p.id,
      projectName: p.nome,
      n4Curta: p.n4Curta,
      n4: p.n4,
      gestor: p.gestor,
      saldo,
      orcamento2026,
      realizado2026,
      emPagamento2026,
      executado: realizado2026 + emPagamento2026,
      compromisso,
      lastMovementAt,
      lastMovementType,
      daysSinceMovement,
      group
    });
  }

  return res;
}

export function sumProvisioned(rows: OperationalRow[]) {
  let prov26 = 0;
  let provRisco = 0;
  let prov27 = 0;

  for (const r of rows) {
    if (r.stage === 'DESCONHECIDA' || r.stage === 'RESIDUAL') continue;
    if (r.classification === "CAIXA_26") prov26 += r.value;
    else if (r.classification === "EM_RISCO") provRisco += r.value;
    else if (r.classification === "CAIXA_27") prov27 += r.value;
  }

  return { prov26, provRisco, prov27 };
}

export function summarizeBalances(rows: ProjectBalance[]) {
  const summary = {
    parado: { count: 0, value: 0, neverMoved: 0 },
    ativo: { count: 0, value: 0 },
    acimaBg: { count: 0, value: 0 },
    liquido: 0
  };

  for (const r of rows) {
    if (r.group === 'PARADO') {
      summary.parado.count++;
      summary.parado.value += r.saldo;
      if (r.lastMovementAt === null) summary.parado.neverMoved++;
      summary.liquido += r.saldo;
    } else if (r.group === 'ATIVO_COM_SALDO') {
      summary.ativo.count++;
      summary.ativo.value += r.saldo;
      summary.liquido += r.saldo;
    } else if (r.group === 'ACIMA_BG') {
      summary.acimaBg.count++;
      summary.acimaBg.value += r.saldo;
      summary.liquido += r.saldo;
    }
  }

  return summary;
}

export function buildProjectsAtRisk(rows: OperationalRow[]) {
  const projectMap = new Map<string, { projectName: string; n4: string; platformManager: string | null; rcCount: number; value: number }>();

  for (const row of rows) {
    if (row.stage === 'DESCONHECIDA' || row.stage === 'RESIDUAL') continue;
    
    if (row.classification === 'EM_RISCO') {
      const pKey = row.projectName || "Sem Projeto";
      let p = projectMap.get(pKey);
      if (!p) {
        p = { projectName: pKey, n4: row.n4, platformManager: row.platformManager, rcCount: 0, value: 0 };
        projectMap.set(pKey, p);
      }
      p.rcCount++;
      p.value += row.value;
    }
  }

  const result = Array.from(projectMap.values()).sort((a, b) => b.value - a.value);
  const top10Value = result.slice(0, 10).reduce((sum, p) => sum + p.value, 0);
  const totalValue = result.reduce((sum, p) => sum + p.value, 0);

  return {
    projects: result,
    totalValue,
    count: result.length,
    top10Value
  };
}

export function buildCurationConsistency(rows: OperationalRow[], dataBase: Date, exerciseYear: number) {
  // escopo pareto: RCs em aberto ordenadas por valor desc, acumulando até atingir 80% do valor total (inclui a RC que cruza os 80%).
  const validRows = rows.filter(r => r.stage !== 'DESCONHECIDA' && r.stage !== 'RESIDUAL');
  const sorted = [...validRows].sort((a, b) => b.value - a.value);
  
  const grandTotal = sorted.reduce((sum, r) => sum + r.value, 0);
  const target = grandTotal * 0.8;
  
  let scopeValue = 0;
  let scopeCount = 0;
  let confirmed = 0;
  let divergent = 0;
  let expired = 0;

  const dbStr = dataBase.toISOString().slice(0, 10);

  for (const r of sorted) {
    scopeValue += r.value;
    scopeCount++;
    
    if (r.isClassificationConfirmed) {
      confirmed++;
      if (r.classification !== suggestClassification(r, exerciseYear)) {
        divergent++;
      }
    }
    
    // expired = RCs do escopo com data esperada (entrega ou pagamento) < dataBase e ainda em aberto.
    if (r.isClassificationConfirmed && r.classification !== 'NAO_OCORRE') {
      const dateToCheck = r.forecastPaymentDate;
      if (dateToCheck && dateToCheck < dbStr) {
        expired++;
      }
    }

    if (scopeValue >= target) break;
  }

  return { scopeCount, scopeValue, confirmed, divergent, expired, grandTotal };
}

export interface BuildInsightsInput {
  bgSistemico: number;
  projetado: number;
  realizado: number;
  emPagamento: number;
  projetosEmRiscoCount: number;
  projetosEmRiscoValue: number;
  top10RiscoValue: number;
  dataBase: Date;
  opRows: OperationalRow[];
  saldoParadoValue: number;
  curadoriaPendenteValue: number;
}

export interface Insight {
  kind: 'resumo' | 'risco' | 'tendencia' | 'acao';
  text: string;
  value: number;
  severity: 'neutral' | 'warn' | 'crit' | 'info';
  target: 'composicao' | 'risco' | 'saldo' | 'curadoria' | 'radar';
}

function formatBrl(val: number): string {
  return (val / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "M";
}

export function buildBottleneck(opRows: OperationalRow[]) {
  const map = new Map<string, { stage: string, area: string, value: number, rcCount: number }>();
  for (const r of opRows) {
    if (r.classification !== 'EM_RISCO') continue;
    if (r.stage === 'RESIDUAL' || r.stage === 'DESCONHECIDA') continue;
    const stage = r.stage || "Desconhecida";
    const area = r.ownerArea || "Área não informada";
    const key = `${stage}|${area}`;
    let b = map.get(key);
    if (!b) {
      b = { stage, area, value: 0, rcCount: 0 };
      map.set(key, b);
    }
    b.value += r.value;
    b.rcCount++;
  }
  return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

/** Meses inteiros depois do mês da data-base até dezembro (mínimo 1) e meses decorridos até o mês da data-base. */
export function monthsWindow(dataBase: Date) {
  const m = dataBase.getMonth();
  return { elapsed: m + 1, left: Math.max(1, 11 - m) };
}

export interface BridgeInput {
  bg: number;
  realizado: number;
  emPagamento: number;
  prov26: number;
  provRisco: number;
  prov27: number;
  residual: number;
  naoOcorre?: number;
  saldoLiquido: number;
}

export interface BridgeStep { label: string; value: number; kind: 'start' | 'minus' | 'result' | 'diff' }

/**
 * Ponte do BG ao caixa projetado. Fecha por construção quando o compromisso da carteira
 * bate com a soma das RCs do bundle; a diferença entre as duas bases aparece numa linha própria.
 */
export function buildBridge(i: BridgeInput): { steps: BridgeStep[]; projetado: number; diferenca: number } {
  const projetado = i.realizado + i.emPagamento + i.prov26;
  const naoOcorre = i.naoOcorre ?? 0;
  const diferenca = i.bg - i.saldoLiquido - i.residual - naoOcorre - i.prov27 - i.provRisco - projetado;
  const steps: BridgeStep[] = [
    { label: 'BG 2026', value: i.bg, kind: 'start' },
    { label: 'Saldo líquido a emitir', value: i.saldoLiquido, kind: 'minus' },
    { label: 'Residuais (sem emissão prevista)', value: i.residual, kind: 'minus' },
    ...(naoOcorre > 0 ? [{ label: 'Não ocorre (liberado pelo gestor)', value: naoOcorre, kind: 'minus' as const }] : []),
    { label: 'Provisionado 27 (atraso, não é saldo)', value: i.prov27, kind: 'minus' },
    { label: 'Em risco', value: i.provRisco, kind: 'minus' },
  ];
  if (Math.abs(diferenca) >= 10_000) steps.push({ label: 'Diferença entre bases (compromisso da carteira × RCs)', value: diferenca, kind: 'diff' });
  steps.push({ label: 'Caixa projetado 2026', value: projetado, kind: 'result' });
  return { steps, projetado, diferenca };
}

export function buildInsights(input: BuildInsightsInput): Insight[] {
  const { bgSistemico, projetado, realizado, emPagamento, projetosEmRiscoValue, top10RiscoValue, dataBase, opRows, saldoParadoValue, curadoriaPendenteValue } = input;
  
  const pctBg = bgSistemico > 0 ? (projetado / bgSistemico) * 100 : 0;
  const faltam = bgSistemico - projetado;
  const faltamStr = faltam > 0 ? formatBrl(faltam) : "0";
  const pctRiscoTop10 = projetosEmRiscoValue > 0 ? (top10RiscoValue / projetosEmRiscoValue) * 100 : 0;

  const insights: Insight[] = [];
  
  insights.push({
    kind: 'resumo',
    text: `Caixa projetado de R$ ${formatBrl(projetado)} (${pctBg.toFixed(0)}% do BG). Faltam R$ ${faltamStr}; R$ ${formatBrl(projetosEmRiscoValue)} estão em risco, ${pctRiscoTop10.toFixed(0)}% deles em 10 projetos.`,
    value: 0,
    severity: 'neutral',
    target: 'composicao'
  });

  const bottlenecks = buildBottleneck(opRows);
  if (bottlenecks.length > 0) {
    const topBot = bottlenecks[0];
    const isMaterial = topBot.value >= 1_000_000 || (faltam > 0 && topBot.value >= 0.05 * faltam);
    if (isMaterial) {
      insights.push({
        kind: 'risco',
        text: `A etapa ${topBot.stage} (${topBot.area}) segura R$ ${formatBrl(topBot.value)} em ${topBot.rcCount} RCs.`,
        value: topBot.value,
        severity: 'warn',
        target: 'risco'
      });
    }
  }

  const { elapsed: monthsElapsed, left: monthsLeft } = monthsWindow(dataBase);
  const gap = bgSistemico - realizado - emPagamento;
  const ritmoNecessario = gap > 0 ? gap / monthsLeft : 0;
  const ritmoMedio = realizado / monthsElapsed;

  if (ritmoNecessario > ritmoMedio) {
    const isCrit = ritmoNecessario > 2 * ritmoMedio;
    insights.push({
      kind: 'tendencia',
      text: `Para chegar ao BG é preciso pagar R$ ${formatBrl(ritmoNecessario)}/mês até dezembro; a média do ano é R$ ${formatBrl(ritmoMedio)}/mês.`,
      value: ritmoNecessario - ritmoMedio,
      severity: isCrit ? 'crit' : 'warn',
      target: 'composicao'
    });
  }

  if (curadoriaPendenteValue > 0 || saldoParadoValue > 0) {
    if (curadoriaPendenteValue >= saldoParadoValue) {
      insights.push({
        kind: 'acao',
        text: `Confirmar as RCs do pareto: R$ ${formatBrl(curadoriaPendenteValue)} ainda sem decisão do gestor.`,
        value: curadoriaPendenteValue,
        severity: 'info',
        target: 'curadoria'
      });
    } else {
      insights.push({
        kind: 'acao',
        text: `Revisar o saldo parado: R$ ${formatBrl(saldoParadoValue)} sem movimentação há mais de 60 dias.`,
        value: saldoParadoValue,
        severity: 'info',
        target: 'saldo'
      });
    }
  }

  const [resumo, ...rest] = insights;
  rest.sort((a, b) => b.value - a.value);
  return [resumo, ...rest].slice(0, 4);
}

// ────────────────────────────────────────────────────────────
// buildPlatformComposition — BG 2026 por n4Curta, topN + Outras
// ────────────────────────────────────────────────────────────

export interface PlatformCompositionRow {
  label: string;
  value: number;
  pct: number;
  isOther: boolean;
}

export function buildPlatformComposition(
  lista: ProjetoBase[],
  topN = 4
): { rows: PlatformCompositionRow[]; total: number } {
  const map = new Map<string, number>();
  for (const p of lista) {
    const key = p.n4Curta || "Sem plataforma";
    map.set(key, (map.get(key) ?? 0) + (p.orcamento2026 ?? 0));
  }
  const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  const top = sorted.slice(0, topN);
  const otherValue = sorted.slice(topN).reduce((s, [, v]) => s + v, 0);

  const rows: PlatformCompositionRow[] = top.map(([label, value]) => ({
    label,
    value,
    pct: total > 0 ? value / total : 0,
    isOther: false,
  }));

  if (otherValue > 0) {
    rows.push({ label: "Outras", value: otherValue, pct: total > 0 ? otherValue / total : 0, isOther: true });
  }

  return { rows, total };
}

// ────────────────────────────────────────────────────────────
// buildFlowSummary — resumo do fluxo de caixa planejado × real
// ────────────────────────────────────────────────────────────

export interface FlowSummary {
  realizadoAcumulado: number;
  planejadoAcumulado: number;
  desvio: number;
  /** desvio em relação ao planejado, 0..1 (pode ser negativo) */
  desvioRel: number;
}

export function buildFlowSummary(lista: ProjetoBase[]): FlowSummary {
  let realizadoAcumulado = 0;
  let planejadoAcumulado = 0;
  for (const p of lista) {
    realizadoAcumulado += (p as any).executadoAcumulado ?? (p as any).realizadoAcumulado ?? 0;
    planejadoAcumulado += (p as any).planejadoAcumulado ?? 0;
  }
  const desvio = realizadoAcumulado - planejadoAcumulado;
  const desvioRel = planejadoAcumulado > 0 ? desvio / planejadoAcumulado : 0;
  return { realizadoAcumulado, planejadoAcumulado, desvio, desvioRel };
}
