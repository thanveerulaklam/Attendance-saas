-- Per-company automatic daily attendance WhatsApp (Meta Cloud API recipients + idempotency).
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS whatsapp_auto_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS whatsapp_primary_number VARCHAR(32),
  ADD COLUMN IF NOT EXISTS whatsapp_secondary_number VARCHAR(32),
  ADD COLUMN IF NOT EXISTS whatsapp_last_sent_for_date DATE,
  ADD COLUMN IF NOT EXISTS whatsapp_last_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN companies.whatsapp_auto_enabled IS 'When true, send daily attendance summary via WhatsApp at scheduled time (IST).';
COMMENT ON COLUMN companies.whatsapp_primary_number IS 'E.164-ish digits for daily report; defaults to company.phone when empty.';
COMMENT ON COLUMN companies.whatsapp_secondary_number IS 'Optional second recipient for daily report.';

-- Backfill primary from existing company phone where useful.
UPDATE companies
SET whatsapp_primary_number = regexp_replace(COALESCE(phone, ''), '\D', '', 'g')
WHERE whatsapp_primary_number IS NULL
  AND phone IS NOT NULL
  AND regexp_replace(phone, '\D', '', 'g') <> '';
