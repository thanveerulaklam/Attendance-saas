-- Scheduled demo booking on leads.

ALTER TABLE demo_enquiries
  ADD COLUMN IF NOT EXISTS demo_scheduled_at TIMESTAMPTZ;

ALTER TABLE demo_enquiries DROP CONSTRAINT IF EXISTS demo_enquiries_status_check;

ALTER TABLE demo_enquiries
  ADD CONSTRAINT demo_enquiries_status_check
  CHECK (status IN (
    'not_contacted',
    'contacted',
    'demo_booked',
    'demo_given',
    'sold',
    'lost',
    'converted'
  ));

CREATE INDEX IF NOT EXISTS idx_demo_enquiries_demo_scheduled_at
  ON demo_enquiries (demo_scheduled_at)
  WHERE demo_scheduled_at IS NOT NULL AND status = 'demo_booked';

COMMENT ON COLUMN demo_enquiries.status IS
  'Super admin follow-up: not_contacted, contacted, demo_booked, demo_given, sold, lost, converted.';
COMMENT ON COLUMN demo_enquiries.demo_scheduled_at IS
  'When a demo is booked; used for reminders and row highlighting.';
