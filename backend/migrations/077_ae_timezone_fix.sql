-- UAE tenants: ensure Asia/Dubai locale and repair device punches parsed with IST offset.
-- Device wall clock is Dubai local; when companies.timezone was Asia/Kolkata, punches were
-- stored 90 minutes early in UTC (+5:30 vs +4:00).

UPDATE attendance_logs al
SET punch_time = al.punch_time + INTERVAL '90 minutes'
FROM companies c
WHERE al.company_id = c.id
  AND UPPER(c.country_code) = 'AE'
  AND c.timezone IS DISTINCT FROM 'Asia/Dubai'
  AND al.device_id IS NOT NULL
  AND LOWER(al.device_id) NOT IN ('manual', 'auto_out');

UPDATE companies
SET
  timezone = 'Asia/Dubai',
  currency = CASE
    WHEN currency IS NULL OR currency = '' OR currency = 'INR' THEN 'AED'
    ELSE currency
  END
WHERE UPPER(country_code) = 'AE'
  AND (
    timezone IS DISTINCT FROM 'Asia/Dubai'
    OR currency IS NULL
    OR currency = ''
    OR currency = 'INR'
  );
