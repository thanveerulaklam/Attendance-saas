-- Audit log for compliance and traceability

CREATE TABLE IF NOT EXISTS audit_logs (
    id           BIGSERIAL PRIMARY KEY,
    company_id   BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id      BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action_type  VARCHAR(100) NOT NULL,
    entity_type  VARCHAR(50) NOT NULL,
    entity_id    VARCHAR(100),
    metadata     JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id
    ON audit_logs (company_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created
    ON audit_logs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type
    ON audit_logs (company_id, action_type);
