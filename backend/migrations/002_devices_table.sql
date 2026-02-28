CREATE TABLE IF NOT EXISTS devices (
    id           BIGSERIAL PRIMARY KEY,
    company_id   BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name         VARCHAR(255) NOT NULL,
    api_key      VARCHAR(255) NOT NULL,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT devices_company_api_key_unique UNIQUE (company_id, api_key)
);

CREATE INDEX IF NOT EXISTS idx_devices_company_id
    ON devices (company_id);

CREATE INDEX IF NOT EXISTS idx_devices_api_key
    ON devices (api_key);

