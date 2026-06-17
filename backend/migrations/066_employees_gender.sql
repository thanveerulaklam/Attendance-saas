-- Optional employee gender for filtering and records.

ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS gender VARCHAR(16);

ALTER TABLE employees
    DROP CONSTRAINT IF EXISTS employees_gender_check;

ALTER TABLE employees
    ADD CONSTRAINT employees_gender_check
        CHECK (gender IS NULL OR gender IN ('male', 'female', 'other'));

COMMENT ON COLUMN employees.gender IS 'Employee gender: male, female, or other.';
