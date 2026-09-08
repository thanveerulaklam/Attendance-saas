-- Per-weekday start/end overrides on a shift (e.g. Sunday 11:00, other days 09:30).
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS day_time_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN shifts.day_time_overrides IS
  'Map of weekday (0=Sun..6=Sat) to { start_time, end_time } clock strings. Missing keys use the shift default times.';
