export const DELIVERY_TO_NF_DAYS = 10;
export const NF_TO_PAYMENT_DAYS = 39;

export interface StageConfig {
  residualBalance: number;
  e5ResidualDays: number;
  referenceDate: Date;
}

export const stageConfig: StageConfig = {
  residualBalance: 1000,
  e5ResidualDays: 180,
  referenceDate: new Date(),
};
