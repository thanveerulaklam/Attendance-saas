-- Link employee-role users to employees (employee mobile / self-service login).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS employee_id BIGINT REFERENCES employees(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_company_employee_app
  ON users (company_id, employee_id)
  WHERE role = 'employee' AND employee_id IS NOT NULL;

COMMENT ON COLUMN users.employee_id IS 'When role is employee, links login to employees.id for self-service app.';
