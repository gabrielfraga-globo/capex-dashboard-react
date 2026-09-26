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
      "RC-4;NF-SEM-DATA;2024-06-15;0;25,00",
      "RC-5;NF-20240617-001;2024-06-15;0;0",
      "RC-6;;2024-06-15;10,00;0",
    ].join("\n"));

    expect(records[0].nfIssueDate).toBe("2024-06-15");
    expect(records[0].paymentDate).toBe("2024-06-15");
    expect(records[0].paid).toBeCloseTo(1234.56, 2);
    expect(records[1].pending).toBeCloseTo(987.65, 2);
    expect(records[1].nfIssueDate).toBe("2024-06-16");
    expect(records[2].nfIssueDate).toBe("2024-06-15");
    expect(records[3].nfIssueDate).toBeNull();
    expect(records[4].paid).toBe(0);
    expect(records[4].pending).toBe(0);
    expect(records[5].rc).toBe("RC-6");
    expect(records[5].paid).toBeCloseTo(10, 2);
  });
});

describe("overlapReport", () => {
  it("sobrepõe os pagamentos por RC com o bundle e ordena por valor em pagamento", () => {
    const records = parsePaymentCsv(paymentFixture);
    const overlap = overlapReport(bundleFixture as any, records, { referenceDate: "2026-09-25" });

    expect(overlap.rcCount).toBe(38);
    expect(overlap.totalPaymentValue).toBeCloseTo(3777304.10, 2);
    expect(overlap.totalCommitmentValue).toBeCloseTo(7620825.25, 2);
    expect(overlap.rows.length).toBe(38);
    expect(overlap.rows[0].paymentValue).toBeGreaterThanOrEqual(overlap.rows[1]?.paymentValue ?? 0);
    expect(overlap.byDominantStage.E5?.lines ?? 0).toBe(21);
    expect(overlap.byDominantStage.E5?.paymentValue ?? 0).toBeCloseTo(3183902.90, 2);
    expect(overlap.byDominantStage.RESIDUAL?.lines ?? 0).toBe(6);
    expect(overlap.byDominantStage.RESIDUAL?.paymentValue ?? 0).toBeCloseTo(431827.65, 2);
    expect(overlap.byDominantStage.E4?.lines ?? 0).toBe(10);
    expect(overlap.byDominantStage.E4?.paymentValue ?? 0).toBeCloseTo(158559.01, 2);
    expect(overlap.byDominantStage.E3?.lines ?? 0).toBe(1);
    expect(overlap.byDominantStage.E3?.paymentValue ?? 0).toBeCloseTo(3014.54, 2);

    const totalDominantRc = (overlap.byDominantStage.E5?.lines ?? 0)
      + (overlap.byDominantStage.RESIDUAL?.lines ?? 0)
      + (overlap.byDominantStage.E4?.lines ?? 0)
      + (overlap.byDominantStage.E3?.lines ?? 0);
    expect(totalDominantRc).toBe(38);

    const values = Object.values(overlap.byDominantStage).map((item) => item.paymentValue);
    const totalValue = values.reduce((sum, value) => sum + value, 0);
    expect(totalValue).toBeCloseTo(overlap.totalPaymentValue, 2);
    for (const row of overlap.rows) {
      expect(row.dominantStageValue).toBeLessThanOrEqual(Math.max(row.commitmentValue, 0) + 0.01);
      const stageSum = Object.values(row.stages).reduce((sum, count) => sum + count, 0);
      expect(stageSum).toBeGreaterThanOrEqual(1);
    }
  });

  it("aplica a regra residual quando CLOSED FOR RECEIVING está vencido pela data prometida", () => {
    const bundle = {
      commitments: [
        {
          rc: "RCGRJ10485649",
          oc: "OC-1",
          projectId: "PPM-1",
          projectName: "Projeto Residual",
          rubrica: "RUBRICA",
          supplier: "Fornecedor",
          systemStatus: "CLOSED FOR RECEIVING",
          systemNeedDate: "2025-01-01",
          systemPromisedDate: "2025-04-11",
          sourceValue: 1000,
          lineCount: 1,
          details: [
            {
              idPpm: "PPM-1",
              nomeLb: "Projeto Residual",
              rubrica: "RUBRICA",
              reqCompra: "RCGRJ10485649",
              ordemCompra: "OC-1",
              fornecedor: "Fornecedor",
              comprador: "Comprador",
              statusCompromisso: "CLOSED FOR RECEIVING",
              statusRc: "APPROVED",
              dataNecessidade: "2025-01-01",
              dataPrometida: "2025-04-11",
              valorCompromisso: 1000,
            },
          ],
        },
      ],
    } as any;

    const payments = [{
      rc: "RCGRJ10485649",
      nf: "NF-001",
      nfIssueDate: "2026-01-01",
      paymentDate: "2026-01-01",
      paid: 0,
      pending: 900,
      projectName: "Projeto Residual",
      n4: null,
      rubrica: null,
      approver: null,
    }];

    const overlap = overlapReport(bundle, payments, { referenceDate: "2026-09-25" });
    expect(overlap.rows[0].dominantStage).toBe("RESIDUAL");
    expect(overlap.rows[0].dominantStageValue).toBeCloseTo(1000, 2);
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
