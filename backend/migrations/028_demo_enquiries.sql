CREATE TABLE IF NOT EXISTS demo_enquiries (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  business_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  employees_range TEXT NOT NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'landing',
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_enquiries_created_at
  ON demo_enquiries(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_demo_enquiries_phone
  ON demo_enquiries(phone_number);

