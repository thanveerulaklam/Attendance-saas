-- Optional shift assignment per employee (for attendance/payroll rules).

ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS shift_id BIGINT REFERENCES shifts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_shift_id ON employees (shift_id);

COMMENT ON COLUMN employees.shift_id IS 'Shift assigned to this employee; used for attendance and payroll rules.';
