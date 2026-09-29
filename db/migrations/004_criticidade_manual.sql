-- ============================================================
-- Radar de Risco de Caixa — criticidade manual (Fase 7d)
-- Adiciona campos para o gestor ajustar a criticidade da RC.
-- ============================================================

ALTER TABLE commitment_curation
    ADD COLUMN IF NOT EXISTS criticality_override text;

ALTER TABLE commitment_curation
    DROP CONSTRAINT IF EXISTS commitment_curation_criticality_override_chk;

ALTER TABLE commitment_curation
    ADD CONSTRAINT commitment_curation_criticality_override_chk
    CHECK (criticality_override IS NULL OR criticality_override IN ('CRITICO', 'ATENCAO', 'NORMAL'));

ALTER TABLE commitment_curation
    ADD COLUMN IF NOT EXISTS criticality_updated_by text;

ALTER TABLE commitment_curation
    ADD COLUMN IF NOT EXISTS criticality_updated_at timestamptz;
