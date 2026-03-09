-- Allow explicit 'declined' and 'locked' statuses for companies
-- 'locked' is used to manually block access for overdue or problematic customers.

ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_status_check;

ALTER TABLE companies
  ADD CONSTRAINT companies_status_check
  CHECK (status IN ('pending', 'active', 'declined', 'locked'));

