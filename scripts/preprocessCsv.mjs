import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseCsvCarteira, csvObjects } from "../src/lib/csvProcessingCore.ts";
import { attachPaymentsSection } from "../src/features/radar/payment.ts";
import { consolidarCompromissos } from "../process-data/consolidateCommitments.ts";

const DATA = resolve("public/data");
const OUTPUT = resolve(DATA, "carteira-processed.json");
const RADAR_OUTPUT = resolve(DATA, "radar-bundle.json");
const read = (name) => readFileSync(resolve(DATA, name), "utf-8").replace(/^\uFEFF/, "");
const normalizeKey = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();

async function main() {
  const start = performance.now();
  let current = {};
  try { current = JSON.parse(readFileSync(OUTPUT, "utf-8")); } catch { current = {}; }

  const parsed = parseCsvCarteira({
    orcamentoCsv: read("orcamento.csv"),
    realizadoCsv: read("Realizado.csv"),
    fluxoMensalCsv: read("Fluxo_Mensal.csv"),
    gestores: current.gestores ?? [],
    statusReportValores: current.statusReportValores ?? {},
  });

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(parsed)}\n`, "utf-8");
  console.log(`[preprocessCsv] OK: ${parsed.projetos.length} projetos em ${(performance.now() - start).toFixed(1)}ms`);

  // Radar de Risco de Caixa: consolida o mesmo export (grão RC+OC+PPM), lado a lado
  // com o pipeline existente, sem alterar seu formato de saída.
  const linhasRadar = csvObjects(read("compromissos_detalhados.csv"));
  const bundle = consolidarCompromissos(linhasRadar, new Date().getFullYear());

  const gestoresPorN4 = new Map((parsed.gestores ?? []).map((g) => [normalizeKey(g.n4), g]));
  const n4SemGestor = new Set();
  for (const commitment of bundle.commitments) {
    const n4Key = normalizeKey(commitment.n4 || "");
    const gestor = n4Key ? gestoresPorN4.get(n4Key)?.nome ?? null : null;
    commitment.platformManager = gestor;
    for (const line of commitment.details) {
      line.n4 = commitment.n4 || line.n4 || "";
      line.platformManager = gestor;
      if (!n4Key) continue;
      if (!gestor) n4SemGestor.add(commitment.n4 || line.n4 || "");
    }
    if (commitment.n4 && !gestor) {
      n4SemGestor.add(commitment.n4);
    }
  }
  if (n4SemGestor.size) {
    const items = [...n4SemGestor].sort();
    console.warn(`[preprocessCsv] Sem gestor da plataforma para N4(s): ${items.join(", ")}`);
  }

  const projectActivityMap = new Map();
  const getAct = (n4, nomeLB) => {
    const pKey = `${normalizeKey(n4)}|${normalizeKey(nomeLB)}`;
    if (!pKey || pKey === "|") return null;
    let act = projectActivityMap.get(pKey);
    if (!act) {
      act = { projectKey: pKey, lastPaymentAt: null, lastCommitmentCreatedAt: null, lastRcApprovedAt: null };
      projectActivityMap.set(pKey, act);
    }
    return act;
  };

  for (const commitment of bundle.commitments) {
    const act = getAct(commitment.n4, commitment.projectName);
    if (!act) continue;
    for (const det of commitment.details) {
      if (det.commitmentCreatedAt && (!act.lastCommitmentCreatedAt || det.commitmentCreatedAt > act.lastCommitmentCreatedAt)) {
        act.lastCommitmentCreatedAt = det.commitmentCreatedAt;
      }
      if (det.rcApprovedAt && (!act.lastRcApprovedAt || det.rcApprovedAt > act.lastRcApprovedAt)) {
        act.lastRcApprovedAt = det.rcApprovedAt;
      }
    }
  }

  try {
    const pagamentoCsv = read("Realizado_Detalhado.csv");
    const attached = attachPaymentsSection(bundle, pagamentoCsv);
    if (attached.status === "ok") {
      Object.assign(bundle, attached.bundle);
      console.log(
        `[preprocessCsv] Radar pagamentos: ${attached.bundle.payments.totals.inPaymentLines} linhas E7, R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(attached.bundle.payments.totals.pending)} em pagamento`
      );
    } else {
      console.warn(`[preprocessCsv] Radar pagamentos IGNORADO: ${attached.reason}`);
    }

    const pagamentosObj = csvObjects(pagamentoCsv);
    for (const pag of pagamentosObj) {
      const act = getAct(pag.N4, pag.NomeLB);
      if (act && pag.NF_DT_PAGAMENTO) {
        const dt = pag.NF_DT_PAGAMENTO.slice(0, 10);
        if (!act.lastPaymentAt || dt > act.lastPaymentAt) {
          act.lastPaymentAt = dt;
        }
      }
    }
  } catch {
    console.warn("[preprocessCsv] Radar pagamentos IGNORADO: arquivo ausente");
  }

  bundle.projectActivity = Array.from(projectActivityMap.values());
  writeFileSync(RADAR_OUTPUT, `${JSON.stringify(bundle)}\n`, "utf-8");
  console.log(`[preprocessCsv] Radar OK: ${bundle.totals.keys} chaves, ${bundle.totals.rcs} RCs em ${(performance.now() - start).toFixed(1)}ms`);
}
main().catch((error) => { console.error("[preprocessCsv] Falha", error); process.exit(1); });
