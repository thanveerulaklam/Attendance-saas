-- Per-company daily WhatsApp send hour (IST, on the hour; default 11:00).
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS whatsapp_send_time TIME NOT NULL DEFAULT '11:00:00';

COMMENT ON COLUMN companies.whatsapp_send_time IS 'IST hour (minutes always :00) when daily attendance WhatsApp is sent if auto-enabled.';

UPDATE companies
SET whatsapp_send_time = '11:00:00'
WHERE whatsapp_send_time IS NULL;
