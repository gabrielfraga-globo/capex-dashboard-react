-- ============================================================
-- Radar de Risco de Caixa — decisão do gestor (Fase 3a)
-- Adiciona campos opcionais sem alterar o esquema existente.
-- ============================================================

ALTER TABLE commitment_curation
    ADD COLUMN IF NOT EXISTS cash_forecast text;

ALTER TABLE commitment_curation
    ADD COLUMN IF NOT EXISTS non_occurrence_reason text;

ALTER TABLE commitment_curation
    DROP CONSTRAINT IF EXISTS commitment_curation_cash_forecast_chk;

-- A intenção de caixa do exercício/próximo exercício é derivada de forecast_payment_date.
-- O valor gravado em cash_forecast é somente o caso excepcional de não ocorrência.
ALTER TABLE commitment_curation
    ADD CONSTRAINT commitment_curation_cash_forecast_chk
    CHECK (
        cash_forecast IS NULL OR
        (cash_forecast = 'NAO_OCORRE' AND non_occurrence_reason IS NOT NULL) OR
        (cash_forecast = 'NAO_OCORRE' AND non_occurrence_reason IN ('CANCELAR','REDUZIR','TROCAR_FORNECEDOR','ENCERRAR_SALDO','LEGADO'))
    );

ALTER TABLE commitment_curation
    ADD COLUMN IF NOT EXISTS suggested_payment_date date;

ALTER TABLE commitment_curation
    ADD COLUMN IF NOT EXISTS forecast_payment_date date;

ALTER TABLE commitment_curation
    ADD COLUMN IF NOT EXISTS payment_date_adjusted boolean;

ALTER TABLE commitment_curation
    DROP CONSTRAINT IF EXISTS commitment_curation_payment_date_adjusted_chk;

ALTER TABLE commitment_curation
    ADD CONSTRAINT commitment_curation_payment_date_adjusted_chk
    CHECK (payment_date_adjusted IS NOT TRUE OR forecast_payment_date IS NOT NULL);

ALTER TABLE commitment_curation
    ADD COLUMN IF NOT EXISTS payment_exception_reason text;

ALTER TABLE commitment_curation
    DROP CONSTRAINT IF EXISTS commitment_curation_payment_exception_reason_len_chk;

ALTER TABLE commitment_curation
    ADD CONSTRAINT commitment_curation_payment_exception_reason_len_chk
    CHECK (payment_exception_reason IS NULL OR length(payment_exception_reason) <= 120);

ALTER TABLE commitment_curation
    ADD COLUMN IF NOT EXISTS confidence text;

ALTER TABLE commitment_curation
    DROP CONSTRAINT IF EXISTS commitment_curation_confidence_chk;

ALTER TABLE commitment_curation
    ADD CONSTRAINT commitment_curation_confidence_chk
    CHECK (confidence IS NULL OR confidence IN ('CONFIRMADO','PROVAVEL','INCERTO'));

ALTER TABLE commitment_curation
    DROP CONSTRAINT IF EXISTS commitment_curation_non_occurrence_reason_chk;

ALTER TABLE commitment_curation
    ADD CONSTRAINT commitment_curation_non_occurrence_reason_chk
    CHECK (non_occurrence_reason IS NULL OR non_occurrence_reason IN ('CANCELAR','REDUZIR','TROCAR_FORNECEDOR','ENCERRAR_SALDO','LEGADO'));

ALTER TABLE commitment_curation
    DROP CONSTRAINT IF EXISTS commitment_curation_cash_forecast_reason_chk;

ALTER TABLE commitment_curation
    ADD CONSTRAINT commitment_curation_cash_forecast_reason_chk
    CHECK (cash_forecast IS NULL OR cash_forecast <> 'NAO_OCORRE' OR non_occurrence_reason IS NOT NULL);

ALTER TABLE commitment_curation
    ADD COLUMN IF NOT EXISTS blocker text;

ALTER TABLE commitment_curation
    DROP CONSTRAINT IF EXISTS commitment_curation_blocker_chk;

ALTER TABLE commitment_curation
    ADD CONSTRAINT commitment_curation_blocker_chk
    CHECK (blocker IS NULL OR blocker IN ('APROVACAO','COTACAO_LICITACAO','CONTRATO','PROPOSTA_FORNECEDOR','PRAZO_FORNECEDOR','IMPORTACAO','ENTREGA_PARCIAL','RECEBIMENTO','NF','ORCAMENTO','SEM_BLOQUEIO'));

ALTER TABLE commitment_curation
    ADD COLUMN IF NOT EXISTS next_action text;

ALTER TABLE commitment_curation
    DROP CONSTRAINT IF EXISTS commitment_curation_next_action_len_chk;

ALTER TABLE commitment_curation
    ADD CONSTRAINT commitment_curation_next_action_len_chk
    CHECK (next_action IS NULL OR length(next_action) <= 80);

ALTER TABLE commitment_curation
    ADD COLUMN IF NOT EXISTS next_action_updated_at timestamptz;

ALTER TABLE commitment_curation
    ADD COLUMN IF NOT EXISTS physical_arrival boolean;

ALTER TABLE commitment_curation
    ADD COLUMN IF NOT EXISTS payment_mode text;

ALTER TABLE commitment_curation
    DROP CONSTRAINT IF EXISTS commitment_curation_payment_mode_chk;

ALTER TABLE commitment_curation
    ADD CONSTRAINT commitment_curation_payment_mode_chk
    CHECK (payment_mode IS NULL OR payment_mode IN ('NORMAL','ANTECIPADO','MEDICAO_MENSAL'));

ALTER TABLE commitment_curation
    ADD COLUMN IF NOT EXISTS priority text;

ALTER TABLE commitment_curation
    DROP CONSTRAINT IF EXISTS commitment_curation_priority_chk;

ALTER TABLE commitment_curation
    ADD CONSTRAINT commitment_curation_priority_chk
    CHECK (priority IS NULL OR priority IN ('ALTA','MEDIA','BAIXA'));

ALTER TABLE commitment_curation
    ADD COLUMN IF NOT EXISTS decision_stage text;

ALTER TABLE commitment_curation
    ADD COLUMN IF NOT EXISTS decision_updated_at timestamptz;
