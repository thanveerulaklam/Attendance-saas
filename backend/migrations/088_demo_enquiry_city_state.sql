-- City and state on demo leads (landing form + admin CRM).

ALTER TABLE demo_enquiries
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT;

CREATE INDEX IF NOT EXISTS idx_demo_enquiries_city_lower
  ON demo_enquiries (LOWER(TRIM(city)))
  WHERE city IS NOT NULL AND TRIM(city) <> '';

CREATE INDEX IF NOT EXISTS idx_demo_enquiries_state_lower
  ON demo_enquiries (LOWER(TRIM(state)))
  WHERE state IS NOT NULL AND TRIM(state) <> '';

COMMENT ON COLUMN demo_enquiries.city IS 'Lead city, reused as autocomplete suggestions for consistent spelling.';
COMMENT ON COLUMN demo_enquiries.state IS 'Lead state, reused as autocomplete suggestions for consistent spelling.';
