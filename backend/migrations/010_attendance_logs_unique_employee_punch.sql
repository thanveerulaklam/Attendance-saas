-- Deduplicate: keep lowest id per (employee_id, punch_time)
DELETE FROM attendance_logs a
USING attendance_logs b
WHERE a.id > b.id
  AND a.employee_id = b.employee_id
  AND a.punch_time = b.punch_time;

-- Unique constraint to prevent duplicate punches (same employee, same timestamp)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_logs_employee_punch_time_unique'
  ) THEN
    ALTER TABLE attendance_logs
    ADD CONSTRAINT attendance_logs_employee_punch_time_unique
    UNIQUE (employee_id, punch_time);
  END IF;
END $$;
