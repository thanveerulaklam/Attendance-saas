-- Call attempts and outcomes for CRM leads.

CREATE TABLE IF NOT EXISTS demo_enquiry_calls (
  id BIGSERIAL PRIMARY KEY,
  enquiry_id BIGINT NOT NULL REFERENCES demo_enquiries(id) ON DELETE CASCADE,
  outcome VARCHAR(32) NOT NULL DEFAULT 'pending',
  notes TEXT NULL,
  called_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demo_enquiry_calls_outcome_check CHECK (outcome IN (
    'pending',
    'no_answer',
    'busy',
    'voicemail',
    'callback',
    'connected',
    'interested',
    'not_interested',
    'wrong_number'
  ))
);

CREATE INDEX IF NOT EXISTS idx_demo_enquiry_calls_enquiry_called
  ON demo_enquiry_calls (enquiry_id, called_at DESC, id DESC);

ALTER TABLE demo_enquiries
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;

COMMENT ON TABLE demo_enquiry_calls IS
  'Each Call click logs an attempt; outcome can be filled or updated after the call.';
COMMENT ON COLUMN demo_enquiries.last_contacted_at IS
  'When the lead was last called from the CRM.';
