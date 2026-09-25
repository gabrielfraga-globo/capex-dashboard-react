ALTER TABLE commitment_curation
    DROP CONSTRAINT IF EXISTS po_status_valido;

ALTER TABLE commitment_curation
    ADD CONSTRAINT po_status_valido
    CHECK (po_status IN ('CONFIRMED', 'AT_RISK', 'CARRYOVER', 'CANCELLED', 'NO_VISIBILITY'));