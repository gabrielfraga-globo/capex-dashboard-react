import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { overlapReport, parsePaymentCsv, paymentReport, reconciliationVsAggregate } from "./payment";

const paymentFixture = readFileSync(new URL("./__fixtures__/realizado-detalhado-HEAD-7e3db7b.csv", import.meta.url), "utf8");
const bundleFixture = JSON.parse(
  readFileSync(new URL("./__fixtures__/radar-bundle-2026-09-25T16-51-32Z.json", import.meta.url), "utf8")
) as { commitments: Array<{ rc: string; sourceValue: number; systemStatus: string; oc: string; projectId: string }> };
const aggregateFixture = readFileSync(new URL("../../../public/data/Realizado.csv", import.meta.url), "utf8");

describe("paymentReport", () => {
  it("oráculo do Realizado_Detalhado.csv em 2026", () => {
    const records = parsePaymentCsv(paymentFixture);
    const report = paymentReport(records);

    expect(report.lines).toBe(3986);
    expect(report.pending).toBeCloseTo(8210831.11, 2);
    expect(report.byStage.E7.lines).toBe(346);
    expect(report.byStage.E7.pending).toBeCloseTo(8210831.11, 2);
    expect(report.byStage.E8.lines).toBe(3510);
    expect(report.byStage.E8.paid).toBeCloseTo(72386783.47, 2);
    expect(report.e7DistinctRcCount).toBe(130);
    expect(report.withoutRcLines).toBe(64);
    expect(report.withoutRcValue).toBeCloseTo(-37131.87, 2);
    expect(report.ignoredLines).toBe(130);
    expect(report.paidAndPendingTogether).toBe(0);
  });

  it("parseia valores decimais e datas de emissão da nota fiscal de forma estável", () => {
    const records = parsePaymentCsv([
      "REQ_COMPRA;NOTA_FISCAL;NF_DTPAGAMENTO;Realizado_Pago;Realizado_Pendente",
      "RC-1;NF-20240615-001;2024-06-15;1234,56;0",
      "RC-2;NF-20240616-002;20240616;0;987,65",
      "RC-3;NF-20240615-999;2024-06-15;0;0",
    ].join("\n"));

    expect(records[0].nfIssueDate).toBe("2024-06-15");
    expect(records[0].paymentDate).toBe("2024-06-15");
    expect(records[0].paid).toBeCloseTo(1234.56, 2);
    expect(records[1].pending).toBeCloseTo(987.65, 2);
    expect(records[1].nfIssueDate).toBe("2024-06-16");
    expect(records[2].nfIssueDate).toBe("2024-06-15");
  });
});

describe("overlapReport", () => {
  it("sobrepõe os pagamentos por RC com o bundle e ordena por valor em pagamento", () => {
    const records = parsePaymentCsv(paymentFixture);
    const overlap = overlapReport(bundleFixture as any, records);

    expect(overlap.rcCount).toBe(38);
    expect(overlap.totalPaymentValue).toBeCloseTo(3777304.10, 2);
    expect(overlap.totalCommitmentValue).toBeCloseTo(7620825.25, 2);
    expect(overlap.rows.length).toBe(38);
    expect(overlap.rows[0].paymentValue).toBeGreaterThanOrEqual(overlap.rows[1]?.paymentValue ?? 0);
    expect(overlap.byDominantStage.E5.lines).toBe(23);
    expect(overlap.byDominantStage.E5.paymentValue).toBeCloseTo(3194111.43, 2);
  });
});

describe("reconciliationVsAggregate", () => {
  it("compara detalhado com agregado e mostra a contribuição das linhas sem RC", () => {
    const records = parsePaymentCsv(paymentFixture);
    const reconciliation = reconciliationVsAggregate(records, aggregateFixture);

    expect(reconciliation.detailed.paid).toBeCloseTo(72386783.47, 2);
    expect(reconciliation.detailed.pending).toBeCloseTo(8210831.11, 2);
    expect(reconciliation.aggregate.paid).toBeCloseTo(72423915.30, 2);
    expect(reconciliation.aggregate.pending).toBeCloseTo(8210831.12, 2);
    expect(reconciliation.totalDifference.paid).toBeCloseTo(-37131.83, 2);
    expect(reconciliation.residual.paid).toBeCloseTo(0, 2);
    expect(reconciliation.withoutRc.paid).toBeCloseTo(-37131.83, 2);
    expect(reconciliation.remainingAfterWithoutRc.paid).toBeCloseTo(0, 2);
  });
});
