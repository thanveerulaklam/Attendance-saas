-- CRM-style follow-up status for landing-page demo enquiries.

ALTER TABLE demo_enquiries
  ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'not_contacted',
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;

ALTER TABLE demo_enquiries DROP CONSTRAINT IF EXISTS demo_enquiries_status_check;

ALTER TABLE demo_enquiries
  ADD CONSTRAINT demo_enquiries_status_check
  CHECK (status IN ('not_contacted', 'contacted', 'demo_given', 'sold', 'lost'));

UPDATE demo_enquiries
SET status = 'not_contacted'
WHERE status IS NULL OR TRIM(status) = '';

CREATE INDEX IF NOT EXISTS idx_demo_enquiries_status
  ON demo_enquiries (status);

CREATE INDEX IF NOT EXISTS idx_demo_enquiries_status_created
  ON demo_enquiries (status, created_at DESC);

COMMENT ON COLUMN demo_enquiries.status IS 'Super admin follow-up: not_contacted, contacted, demo_given, sold, lost.';
COMMENT ON COLUMN demo_enquiries.status_updated_at IS 'When status was last changed by super admin.';
