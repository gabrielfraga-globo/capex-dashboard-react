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
