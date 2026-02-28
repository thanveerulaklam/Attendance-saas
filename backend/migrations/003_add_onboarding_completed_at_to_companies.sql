ALTER TABLE companies
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

