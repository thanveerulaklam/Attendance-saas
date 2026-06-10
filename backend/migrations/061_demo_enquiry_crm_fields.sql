-- CRM fields: manual leads, conversion tracking, richer contact data.

ALTER TABLE demo_enquiries
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS expected_plan VARCHAR(32),
  ADD COLUMN IF NOT EXISTS converted_company_id BIGINT REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

ALTER TABLE demo_enquiries DROP CONSTRAINT IF EXISTS demo_enquiries_status_check;

ALTER TABLE demo_enquiries
  ADD CONSTRAINT demo_enquiries_status_check
  CHECK (status IN ('not_contacted', 'contacted', 'demo_given', 'sold', 'lost', 'converted'));

CREATE INDEX IF NOT EXISTS idx_demo_enquiries_converted_company
  ON demo_enquiries (converted_company_id)
  WHERE converted_company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_demo_enquiries_email
  ON demo_enquiries (LOWER(email))
  WHERE email IS NOT NULL;

COMMENT ON COLUMN demo_enquiries.email IS 'Contact email for follow-up and tenant admin prefill.';
COMMENT ON COLUMN demo_enquiries.expected_plan IS 'Plan discussed with the lead (starter, growth, etc.).';
COMMENT ON COLUMN demo_enquiries.converted_company_id IS 'Set when lead is provisioned as an active company.';
COMMENT ON COLUMN demo_enquiries.converted_at IS 'When the lead was converted to a company.';
