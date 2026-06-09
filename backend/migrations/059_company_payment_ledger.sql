-- Immutable payment history for one-time fees and AMC renewals.

CREATE TABLE IF NOT EXISTS company_payment_ledger (
    id              BIGSERIAL PRIMARY KEY,
    company_id      BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    payment_type    VARCHAR(16) NOT NULL,
    amount          NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    payment_date    DATE NOT NULL,
    plan_code       VARCHAR(32),
    payment_status  VARCHAR(16) NOT NULL DEFAULT 'paid',
    source          VARCHAR(32) NOT NULL DEFAULT 'admin',
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT company_payment_ledger_payment_type_check
        CHECK (payment_type IN ('onetime', 'amc')),
    CONSTRAINT company_payment_ledger_payment_status_check
        CHECK (payment_status IN ('trial', 'paid', 'pending', 'overdue', 'unpaid')),
    CONSTRAINT company_payment_ledger_company_type_date_key
        UNIQUE (company_id, payment_type, payment_date)
);

CREATE INDEX IF NOT EXISTS idx_company_payment_ledger_company_id
    ON company_payment_ledger (company_id);

CREATE INDEX IF NOT EXISTS idx_company_payment_ledger_payment_date
    ON company_payment_ledger (payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_company_payment_ledger_company_date
    ON company_payment_ledger (company_id, payment_date DESC);

COMMENT ON TABLE company_payment_ledger IS 'Full payment history per tenant (one-time and each AMC renewal).';
COMMENT ON COLUMN company_payment_ledger.source IS 'How the row was created: backfill, approval, admin_billing, etc.';

-- Seed from existing company billing fields (one row per recorded date).
INSERT INTO company_payment_ledger (
    company_id, payment_type, amount, payment_date, plan_code, payment_status, source
)
SELECT
    c.id,
    'onetime',
    COALESCE(c.onetime_fee_amount, 0),
    c.last_onetime_payment_date,
    c.plan_code,
    COALESCE(c.onetime_payment_status, 'paid'),
    'backfill'
FROM companies c
WHERE c.last_onetime_payment_date IS NOT NULL
  AND COALESCE(c.onetime_fee_amount, 0) > 0
ON CONFLICT (company_id, payment_type, payment_date) DO NOTHING;

INSERT INTO company_payment_ledger (
    company_id, payment_type, amount, payment_date, plan_code, payment_status, source
)
SELECT
    c.id,
    'amc',
    COALESCE(c.amc_amount, 0),
    c.last_amc_payment_date,
    c.plan_code,
    COALESCE(c.amc_payment_status, 'paid'),
    'backfill'
FROM companies c
WHERE c.last_amc_payment_date IS NOT NULL
  AND COALESCE(c.amc_amount, 0) > 0
ON CONFLICT (company_id, payment_type, payment_date) DO NOTHING;
