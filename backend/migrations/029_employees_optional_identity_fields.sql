-- Optional employee identity fields used by the employee create/edit UI.
-- Kept as nullable columns so they can be provided later.
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS phone_number TEXT;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS aadhar_number TEXT;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS esi_number TEXT;

