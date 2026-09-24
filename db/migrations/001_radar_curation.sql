-- ============================================================
-- Radar de Risco de Caixa — camada de curadoria
-- Nenhum dado oficial do BI é gravado aqui.
-- ============================================================

CREATE TABLE IF NOT EXISTS commitment_curation (
    commitment_key           text PRIMARY KEY,
    estimated_delivery_date  date,
    po_status                text        NOT NULL,
    notes                    text,

    -- valor do BI no momento da curadoria: detecta envelhecimento
    source_value_at_curation numeric(18,2),

    -- 'RC'  = gravada pela edição da RC (herdada)
    -- 'KEY' = curada individualmente na expansão (tem precedência)
    curation_level           text        NOT NULL DEFAULT 'RC',

    -- chave PENDING de origem, quando a curadoria foi herdada na transição para OC
    inherited_from_key       text,

    updated_by               text        NOT NULL,
    updated_at               timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT po_status_valido
        CHECK (po_status IN ('CONFIRMED','AT_RISK','CANCELLED','NO_VISIBILITY')),

    CONSTRAINT curation_level_valido
        CHECK (curation_level IN ('RC','KEY')),

    -- CONFIRMED sem data deixaria o compromisso fora de todos os baldes de caixa
    CONSTRAINT confirmed_exige_data
        CHECK (po_status <> 'CONFIRMED' OR estimated_delivery_date IS NOT NULL),

    CONSTRAINT notes_tamanho
        CHECK (notes IS NULL OR length(notes) <= 2000),

    CONSTRAINT chave_formato
        CHECK (commitment_key ~ '^RC:[^|]+\|OC:[^|]+\|PPM:[^|]+$')
);

-- Filtro por RC na edição em lote: RC: até o primeiro pipe.
CREATE INDEX IF NOT EXISTS idx_curation_rc
    ON commitment_curation (split_part(commitment_key, '|', 1));

CREATE INDEX IF NOT EXISTS idx_curation_status
    ON commitment_curation (po_status);


CREATE TABLE IF NOT EXISTS curation_audit (
    id              bigserial PRIMARY KEY,
    commitment_key  text        NOT NULL,
    action          text        NOT NULL,   -- 'RC_UPSERT' | 'KEY_UPSERT'
    payload         jsonb       NOT NULL,   -- estado gravado
    actor           text        NOT NULL,
    occurred_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_key
    ON curation_audit (commitment_key, occurred_at DESC);
