-- Richer call feedback: follow-up slot, reason, and pipeline outcomes.

ALTER TABLE demo_enquiry_calls
  ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS extra_phone TEXT;

ALTER TABLE demo_enquiry_calls DROP CONSTRAINT IF EXISTS demo_enquiry_calls_outcome_check;

ALTER TABLE demo_enquiry_calls
  ADD CONSTRAINT demo_enquiry_calls_outcome_check
    CHECK (outcome IN (
      'pending',
      'no_answer',
      'busy',
      'voicemail',
      'callback',
      'connected',
      'interested',
      'demo_booked',
      'demo_given',
      'sold',
      'not_interested',
      'lost',
      'wrong_number'
    ));

ALTER TABLE demo_enquiries
  ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_demo_enquiries_next_follow_up_at
  ON demo_enquiries (next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL AND status NOT IN ('lost', 'converted');

COMMENT ON COLUMN demo_enquiry_calls.follow_up_at IS
  'Next callback, retry, or demo time captured on this call.';
COMMENT ON COLUMN demo_enquiries.next_follow_up_at IS
  'Next callback or demo slot for reminders.';
