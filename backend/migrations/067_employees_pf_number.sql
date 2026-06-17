-- Optional PF registration number for employees.

ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS pf_number TEXT;

COMMENT ON COLUMN employees.pf_number IS 'Provident Fund (PF) registration / UAN number.';
