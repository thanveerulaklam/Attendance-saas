-- Company switch for door-to-door Field visits (Start / Visit / End).
-- Independent of assigned-site field attendance.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS field_visits_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN companies.field_visits_enabled IS
  'When true, PunchPay Field door-to-door Start / Visit / End is available and Field visits appears in the admin menu.';
