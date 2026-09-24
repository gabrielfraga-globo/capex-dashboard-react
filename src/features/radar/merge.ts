import type {
  CashBucket,
  CommitmentCuration,
  CommitmentSourceBundle,
  CommitmentView,
  CurationMap,
  RadarSummary,
  RcView,
} from "./types";
import { PAYMENT_LEAD_DAYS, PENDING_OC } from "./types";

const CASH_BUCKETS: CashBucket[] = [
  "CONFIRMED_IN_YEAR",
  "CARRYOVER",
  "CONFIRMED_NO_DATE",
  "AT_RISK",
  "NO_VISIBILITY",
  "CANCELLED",
  "NOT_CURATED",
];

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function distinct<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function zeroBuckets(): Record<CashBucket, number> {
  return CASH_BUCKETS.reduce((acc, bucket) => {
    acc[bucket] = 0;
    return acc;
  }, {} as Record<CashBucket, number>);
}

/** Ordem de precedência exata da seção 5: status explícito vence, depois a data de pagamento. */
function classificar(cur: CommitmentCuration | null, pagamento: string | null, corte: string): CashBucket {
  if (!cur) return "NOT_CURATED";
  if (cur.poStatus === "CANCELLED") return "CANCELLED";
  if (cur.poStatus === "AT_RISK") return "AT_RISK";
  if (cur.poStatus === "NO_VISIBILITY") return "NO_VISIBILITY";
  if (!pagamento) return "CONFIRMED_NO_DATE";
  if (pagamento <= corte) return "CONFIRMED_IN_YEAR";
  return "CARRYOVER";
}

/** Assinatura de conteúdo da curadoria, usada para detectar filhas divergentes numa RC. */
function assinaturaDaCuradoria(view: CommitmentView): string {
  if (!view.curation) return "NONE";
  return JSON.stringify({
    estimatedDeliveryDate: view.curation.estimatedDeliveryDate,
    poStatus: view.curation.poStatus,
    notes: view.curation.notes,
    requiresReview: view.requiresReview,
  });
}

/** Mescla o bundle oficial do BI com a curadoria dos gestores. Função pura, sem I/O. */
export function mergearRadar(
  bundle: CommitmentSourceBundle,
  curationMap: CurationMap,
  exercicio: number
): { views: CommitmentView[]; rcViews: RcView[]; resumo: RadarSummary } {
  const corte = `${exercicio}-12-31`;

  // ── Passo 1: uma CommitmentView por chave ──────────────────
  const views: CommitmentView[] = bundle.commitments.map((c) => {
    let cur: CommitmentCuration | null = curationMap[c.commitmentKey] ?? null;
    let requiresReview = false;

    if (!cur && c.oc !== PENDING_OC) {
      const chavePendente = `RC:${c.rc}|OC:${PENDING_OC}|PPM:${c.projectId}`;
      const curPendente = curationMap[chavePendente];
      if (curPendente) {
        cur = { ...curPendente, inheritedFromKey: chavePendente };
        requiresReview = true;
      }
    }

    const pagamento = cur?.estimatedDeliveryDate ? addDays(cur.estimatedDeliveryDate, PAYMENT_LEAD_DAYS) : null;
    const bucket = classificar(cur, pagamento, corte);

    const sourceValueAtCuration = cur?.sourceValueAtCuration ?? null;
    const stale = sourceValueAtCuration != null && Math.abs(c.sourceValue - sourceValueAtCuration) > 0.01;

    return {
      ...c,
      curation: cur,
      expectedPaymentDate: pagamento,
      bucket,
      isCurated: cur != null && !requiresReview,
      isStale: stale,
      staleDelta: stale ? c.sourceValue - sourceValueAtCuration : null,
      requiresReview,
    };
  });

  // ── Passo 2: uma RcView por RC ─────────────────────────────
  const rcViews: RcView[] = bundle.rcGroups.map((g) => {
    const filhas = views.filter((v) => v.rc === g.rc);

    const assinaturas = distinct(filhas.map(assinaturaDaCuradoria));
    const hasMixedCuration = assinaturas.length > 1;
    const effectiveCuration = hasMixedCuration ? null : filhas[0]?.curation ?? null;

    const curatedValue = sum(filhas.filter((v) => v.isCurated).map((v) => v.sourceValue));
    const notCuratedValue = sum(filhas.filter((v) => !v.isCurated).map((v) => v.sourceValue));

    const buckets = zeroBuckets();
    for (const v of filhas) buckets[v.bucket] += v.sourceValue;

    return {
      ...g,
      commitments: filhas,
      effectiveCuration,
      hasMixedCuration,
      curatedValue,
      notCuratedValue,
      buckets,
    };
  });

  // ── Passo 3: resumo ────────────────────────────────────────
  const buckets = zeroBuckets();
  for (const v of views) buckets[v.bucket] += v.sourceValue;

  const totalCommitment = sum(views.map((v) => v.sourceValue));
  const curatedKeys = views.filter((v) => v.isCurated).length;
  const curatedValue = sum(views.filter((v) => v.isCurated).map((v) => v.sourceValue));
  const totalKeys = views.length;

  const somaBaldes = sum(CASH_BUCKETS.map((bucket) => buckets[bucket]));

  const resumo: RadarSummary = {
    exerciseYear: exercicio,
    totalCommitment,
    bgCurated: buckets.CONFIRMED_IN_YEAR,
    carryover: buckets.CARRYOVER,
    notCurated: buckets.NOT_CURATED,
    buckets,
    coverage: {
      curatedKeys,
      totalKeys,
      curatedValue,
      ratio: totalKeys > 0 ? curatedKeys / totalKeys : 0,
    },
    reconciles: Math.abs(somaBaldes - totalCommitment) <= 0.01,
  };

  return { views, rcViews, resumo };
}
