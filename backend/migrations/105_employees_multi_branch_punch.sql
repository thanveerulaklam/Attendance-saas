-- Let selected employees punch biometric devices at any branch of the company.
-- Attendance still counts on the employee's home branch.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS multi_branch_punch BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN employees.multi_branch_punch IS
  'When true, biometric punches from any company device are accepted. The employee stays assigned to one home branch.';
