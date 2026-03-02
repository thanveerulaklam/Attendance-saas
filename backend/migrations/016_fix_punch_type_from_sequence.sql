-- Fix punch_type: set IN/OUT from chronological order per employee per day.
-- First punch of day = IN, second = OUT, third = IN, etc.
-- Fixes existing data where all punches were stored as IN.

UPDATE attendance_logs a
SET punch_type = CASE WHEN sub.rn % 2 = 1 THEN 'in' ELSE 'out' END
FROM (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY employee_id, date_trunc('day', punch_time AT TIME ZONE 'UTC')
      ORDER BY punch_time
    ) AS rn
  FROM attendance_logs
) sub
WHERE a.id = sub.id;
