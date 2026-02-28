-- Initial schema for Attendance SaaS (multi-tenant)

CREATE TABLE IF NOT EXISTS companies (
    id           BIGSERIAL PRIMARY KEY,
    name         VARCHAR(255) NOT NULL,
    email        VARCHAR(255) UNIQUE,
    phone        VARCHAR(50),
    address      TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id           BIGSERIAL PRIMARY KEY,
    company_id   BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name         VARCHAR(255) NOT NULL,
    email        VARCHAR(255) NOT NULL,
    password     VARCHAR(255) NOT NULL,
    role         VARCHAR(50) NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT users_role_check CHECK (role IN ('admin', 'hr', 'employee')),
    CONSTRAINT users_company_email_unique UNIQUE (company_id, email)
);

CREATE TABLE IF NOT EXISTS employees (
    id             BIGSERIAL PRIMARY KEY,
    company_id     BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_code  VARCHAR(50) NOT NULL,
    name           VARCHAR(255) NOT NULL,
    department     VARCHAR(255),
    designation    VARCHAR(255),
    basic_salary   NUMERIC(12,2) NOT NULL DEFAULT 0,
    join_date      DATE NOT NULL,
    status         VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT employees_status_check CHECK (status IN ('active', 'inactive', 'terminated', 'on_leave')),
    CONSTRAINT employees_company_employee_code_unique UNIQUE (company_id, employee_code)
);

CREATE TABLE IF NOT EXISTS shifts (
    id            BIGSERIAL PRIMARY KEY,
    company_id    BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    shift_name    VARCHAR(100) NOT NULL,
    start_time    TIME NOT NULL,
    end_time      TIME NOT NULL,
    grace_minutes INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT shifts_grace_minutes_check CHECK (grace_minutes >= 0)
);

CREATE TABLE IF NOT EXISTS attendance_logs (
    id           BIGSERIAL PRIMARY KEY,
    company_id   BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id  BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    punch_time   TIMESTAMPTZ NOT NULL,
    punch_type   VARCHAR(10) NOT NULL,
    device_id    VARCHAR(100),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT attendance_logs_punch_type_check CHECK (punch_type IN ('in', 'out'))
);

CREATE TABLE IF NOT EXISTS payroll_records (
    id              BIGSERIAL PRIMARY KEY,
    company_id      BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id     BIGINT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    month           SMALLINT NOT NULL,
    year            SMALLINT NOT NULL,
    total_days      NUMERIC(5,2) NOT NULL DEFAULT 0,
    present_days    NUMERIC(5,2) NOT NULL DEFAULT 0,
    overtime_hours  NUMERIC(8,2) NOT NULL DEFAULT 0,
    gross_salary    NUMERIC(12,2) NOT NULL DEFAULT 0,
    deductions      NUMERIC(12,2) NOT NULL DEFAULT 0,
    salary_advance  NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_salary      NUMERIC(12,2) NOT NULL DEFAULT 0,
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT payroll_records_month_check CHECK (month BETWEEN 1 AND 12),
    CONSTRAINT payroll_records_year_check CHECK (year BETWEEN 2000 AND 2100),
    CONSTRAINT payroll_records_company_employee_period_unique
        UNIQUE (company_id, employee_id, year, month)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_company_id
    ON users (company_id);

CREATE INDEX IF NOT EXISTS idx_employees_company_id
    ON employees (company_id);

CREATE INDEX IF NOT EXISTS idx_shifts_company_id
    ON shifts (company_id);

CREATE INDEX IF NOT EXISTS idx_attendance_logs_company_id
    ON attendance_logs (company_id);

CREATE INDEX IF NOT EXISTS idx_payroll_records_company_id
    ON payroll_records (company_id);

CREATE INDEX IF NOT EXISTS idx_attendance_logs_company_employee_time
    ON attendance_logs (company_id, employee_id, punch_time DESC);

CREATE INDEX IF NOT EXISTS idx_payroll_records_company_year_month
    ON payroll_records (company_id, year, month);

CREATE INDEX IF NOT EXISTS idx_employees_company_employee_code
    ON employees (company_id, employee_code);

-- Optimise employee search by company + name
CREATE INDEX IF NOT EXISTS idx_employees_company_name
    ON employees (company_id, name);

