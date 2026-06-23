-- Per-company locale for multi-region support (India default for existing tenants).
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS country_code CHAR(2) NOT NULL DEFAULT 'IN',
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'INR';

UPDATE companies
SET country_code = 'IN',
    timezone = 'Asia/Kolkata',
    currency = 'INR'
WHERE country_code IS DISTINCT FROM 'IN'
   OR timezone IS DISTINCT FROM 'Asia/Kolkata'
   OR currency IS DISTINCT FROM 'INR';

COMMENT ON COLUMN companies.country_code IS 'ISO 3166-1 alpha-2; drives payroll rules and UI feature flags.';
COMMENT ON COLUMN companies.timezone IS 'IANA timezone for attendance day boundaries and device punch parsing.';
COMMENT ON COLUMN companies.currency IS 'ISO 4217 currency code for payroll and billing display.';
