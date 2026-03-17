# Attendance SaaS — Technical Overview

This document describes the technical architecture, stack, APIs, database, and operations for developers and technical stakeholders. For product/feature context, see `PRODUCT_OVERVIEW_FOR_MARKETING.md`. For high-level architecture and modules, see `APP_ARCHITECTURE.md`.

---

## 1. Repository and Project Structure

```
attendance-saas/
├── backend/                 # Node.js API
│   ├── src/
│   │   ├── config/          # database, validateEnv
│   │   ├── controllers/     # HTTP handlers
│   │   ├── middleware/     # auth, subscription, security, errorHandler
│   │   ├── routes/         # Express routers
│   │   ├── services/       # business logic
│   │   ├── utils/          # AppError, etc.
│   │   ├── validators/     # request validation
│   │   └── app.js          # Express app (no listen)
│   ├── scripts/
│   │   ├── migrate.js      # run SQL migrations
│   │   ├── seed.js        # demo company + admin
│   │   └── biometric-connector.js  # dev/test connector
│   ├── migrations/         # numbered SQL files (001_*.sql, ...)
│   ├── server.js           # entry: dotenv, validateEnv, DB test, listen
│   └── package.json
├── frontend/               # React SPA
│   ├── src/
│   │   ├── components/     # reusable UI (e.g. OnboardingChecklist, WhatsAppHelpButton)
│   │   ├── context/        # AuthContext
│   │   ├── layout/         # DashboardLayout
│   │   ├── pages/          # route-level components
│   │   └── utils/          # api (authFetch), subscription
│   ├── index.html
│   ├── vite.config.js      # dev proxy /api → backend
│   └── package.json
├── connector/              # Standalone Node app (sync device → cloud)
│   ├── index.js            # poll device, push to POST /api/device/push
│   ├── config.json / config.example.json
│   ├── install-windows.bat, install-mac.sh, run-windows.bat
│   ├── SETUP_GUIDE_CLIENTS.txt
│   └── package.json        # zk-attendance-sdk; pkg for building .exe / mac binary
└── Docs/                    # documentation
```

---

## 2. Technology Stack

### Backend

| Layer        | Technology |
|-------------|------------|
| Runtime     | Node.js 18+ |
| Framework   | Express 4.x |
| Database    | PostgreSQL (driver: `pg`) |
| Auth        | JWT (jsonwebtoken), bcrypt for passwords |
| Security    | Helmet, CORS, express-rate-limit |
| Env         | dotenv |

### Frontend

| Layer        | Technology |
|-------------|------------|
| Build       | Vite 7 |
| UI          | React 19, React Router DOM 7 |
| Styling     | Tailwind CSS 4 (PostCSS) |
| Charts      | Recharts |

### Connector

- Node.js 18; `zk-attendance-sdk` for TCP communication with ZKTeco (and compatible) devices. Can be packaged with `pkg` into `connector.exe` (Windows) or macOS binary.

### Database

- PostgreSQL only. Single database, multi-tenant by `company_id` on all business tables.

---

## 3. Backend API Overview

Base URL: `http://localhost:3000` (or production API host). All API responses use a common shape: `{ success: boolean, data?: any, message?: string }`.

### 3.1 Public / Unauthenticated

| Method | Path | Description |
|--------|------|-------------|
| GET    | /api/health | Health check (no auth; skip rate limit) |
| POST   | /api/auth/register | Register company + first admin (company created as pending) |
| POST   | /api/auth/login | Login; returns `{ user, token }` |
| GET    | /api/device/ping | Device connectivity check (no auth) |
| POST   | /api/device/webhook | Device direct cloud push; auth via query `key` or header |
| POST   | /api/device/push | Connector bulk push; auth via `x-device-key` header |

### 3.2 Authenticated (JWT: `Authorization: Bearer <token>`)

All other routes use middleware: `authenticate` → optional `requireRole(['admin','hr'])` → `enforceCompanyFromToken`. `company_id` is taken **only** from the JWT (`req.companyId`); body/query `company_id` is stripped.

| Method | Path | Description |
|--------|------|-------------|
| GET    | /api/auth/me | Current user from JWT |
| GET/PUT | /api/company | Get/update company profile (name, phone, address) |
| POST   | /api/company/subscription | Update subscription (admin-only; backend admin) |
| GET    | /api/dashboard/summary | Dashboard KPIs, today absent/on lunch, 7-day trend |
| GET    | /api/employees | List employees (paginated, search, status filter) |
| POST   | /api/employees | Create employee |
| GET/PUT | /api/employees/:id | Get/update employee |
| GET    | /api/shifts | List shifts |
| POST   | /api/shifts | Create shift |
| GET/PUT/DELETE | /api/shifts/:id | Get/update/delete shift |
| GET    | /api/holidays | List company holidays (year, month optional) |
| POST   | /api/holidays | Create holiday |
| DELETE | /api/holidays/:id | Delete holiday |
| GET    | /api/device | List devices (admin/hr) |
| POST   | /api/device | Create device (admin/hr) |
| PUT    | /api/device/:id | Update device name |
| PATCH  | /api/device/:id/activate, /deactivate | Toggle active |
| POST   | /api/device/:id/regenerate-key | New API key for device |
| GET    | /api/attendance/daily | Daily attendance (query: date, employee_id?) |
| GET    | /api/attendance/monthly | Monthly attendance (query: year, month, employee_id?) |
| POST   | /api/attendance/manual-punch | Single manual punch |
| POST   | /api/attendance/manual-full-day | Manual full-day pair (in/out) |
| POST   | /api/attendance/manual-full-day-bulk | Bulk full-day manual |
| PATCH  | /api/attendance/logs/:id | Update punch time/type |
| GET    | /api/payroll | List payroll records (year, month, employee_id, page, limit) |
| POST   | /api/payroll/generate | Generate/regenerate payroll (subscription required) |
| GET    | /api/payroll/breakdown | Payroll breakdown for one record (query: employee_id, year, month) |
| GET    | /api/advances | List advances (year, month) |
| POST   | /api/advances | Create/update advance (employee_id, year, month, amount, note, advance_date) |
| GET    | /api/reports/attendance.csv | Attendance report CSV (year, month) |
| GET    | /api/reports/payroll.csv | Payroll report CSV (year, month) |
| GET    | /api/reports/overtime.csv | Overtime report CSV (year, month) |
| GET    | /api/onboarding/status | Onboarding checklist state (steps, progress, isCompleted) |
| GET    | /api/audit | Audit logs (if implemented) |

### 3.3 Admin (Provider)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | /api/admin/pending-companies | Header `X-Approval-Secret` | List pending companies |
| POST   | /api/admin/approve-company | Header `X-Approval-Secret`; body `{ company_id }` | Approve company |
| POST   | /api/admin/decline-company | Same secret; body `{ company_id }` | Decline company |

`ADMIN_APPROVAL_SECRET` must be set in backend `.env`; the frontend `/admin` page can use this to approve/decline from the UI.

---

## 4. Authentication and Authorization

- **Registration:** `POST /api/auth/register` with `{ company: { name }, admin: { name, email, password } }`. Creates company with status `pending`; optionally returns token if not using approval flow.
- **Login:** `POST /api/auth/login` with `{ email, password }`. If company is not approved, login fails. Returns JWT and user (id, company_id, email, role).
- **JWT:** Signed with `JWT_SECRET`; expiry from `JWT_EXPIRES_IN` (default 7d). Payload includes `user_id`, `company_id`, `email`, `role`. All protected routes use `req.companyId` from token only.
- **Roles:** `admin`, `hr`, `employee`. Most write/read routes require `admin` or `hr` via `requireRole(['admin','hr'])`.
- **Company isolation:** `enforceCompanyFromToken` removes any `company_id` from body/query so it cannot be overridden by client.

---

## 5. Device Authentication (Push / Webhook)

- Each device has an **API key** (stored hashed or in plain per implementation). Connector or device uses this to authenticate:
  - **POST /api/device/push:** Header `x-device-key: <API_KEY>`. Backend resolves device by key, validates `company_id`, then processes logs and updates `last_seen_at`.
  - **POST /api/device/webhook:** Header `x-device-key: <API_KEY>` (preferred) or `Authorization: Bearer <API_KEY>`. Same resolution and processing.
- Device push and webhook are rate-limited (e.g. 200 req/min per IP). Subscription check: if company subscription is expired (past grace), device push can be rejected so punches are not stored (align with business rules).

---

## 6. Subscription and Feature Gating

- Company has `subscription_start_date`, `subscription_end_date`, `is_active`. Grace period (e.g. 7 days) after `subscription_end_date` is applied in code.
- **Backend:** `requireActiveSubscription` middleware is used on payroll generate and optionally on device push. If not allowed, API returns 403 with code `SUBSCRIPTION_EXPIRED`.
- **Frontend:** `getSubscriptionStatus(company)` (in `utils/subscription.js`) drives renewal banner and hiding of payroll/device actions when expired.

---

## 7. Database (PostgreSQL)

### 7.1 Core Tables (from migrations)

- **companies** — id, name, email, phone, address, subscription_start_date, subscription_end_date, is_active, onboarding_completed_at, created_at. Registration status (pending/approved/declined) from migration 006/007.
- **users** — id, company_id, name, email, password (bcrypt hash), role, is_active, created_at. Unique (company_id, email).
- **employees** — id, company_id, name, employee_code, basic_salary, join_date, status, shift_id, daily_travel_allowance, esi_amount, created_at. Unique (company_id, employee_code). Indexes on (company_id, employee_code), (company_id, name).
- **shifts** — id, company_id, shift_name, start_time, end_time, grace_minutes, lunch_minutes, weekly_off_days (array), late_deduction_minutes/amount, lunch_over_deduction_minutes/amount, no_leave_incentive, created_at.
- **devices** — id, company_id, name, api_key, is_active, last_seen_at, created_at.
- **attendance_logs** — id, company_id, employee_id, punch_time, punch_type (in/out), device_id (nullable), created_at. Index (company_id, employee_id, punch_time DESC). Uniqueness/constraints from migration 010 as applicable.
- **payroll_records** — id, company_id, employee_id, year, month, total_days, present_days, overtime_hours, gross_salary, deductions, salary_advance, no_leave_incentive, net_salary, generated_at, created_at. Unique (company_id, employee_id, year, month).
- **employee_advances** — id, company_id, employee_id, year, month, amount, note, advance_date, created_at (migrations 017, 018).
- **company_holidays** — id, company_id, holiday_date, name, kind (migration 009).
- **company_weekly_offs** — company_id, day_of_week (migration 012).
- **audit_logs** — id, company_id, user_id, action_type, entity_type, entity_id, metadata (JSON), created_at (migration 004).

Migrations are run in order via `npm run migrate` (scripts/migrate.js) and are numbered (001_*.sql … 021_*.sql).

### 7.2 Multi-Tenancy

- Every business table has `company_id`. All queries filter by `company_id` from `req.companyId` (JWT). No cross-tenant data exposure.

---

## 8. Backend Configuration and Environment

### 8.1 Required environment variables

- **DB_HOST**, **DB_NAME**, **DB_USER**, **DB_PASSWORD** — PostgreSQL connection.
- **JWT_SECRET** — Required in all environments (validated at startup).

### 8.2 Optional

- **PORT** — Server port (default 3000).
- **NODE_ENV** — development | production (affects CORS, morgan, validateEnv strictness).
- **DB_PORT**, **DB_POOL_MAX** — DB config.
- **JWT_EXPIRES_IN** — e.g. `7d`.
- **CORS_ORIGIN** — Frontend origin for CORS (default `*` in dev).
- **ADMIN_APPROVAL_SECRET** — Secret for admin approve/decline endpoints.
- **AUTH_RATE_LIMIT_MAX** — Max requests per 15 min for auth routes (default 50).

### 8.3 Startup

- `server.js` loads dotenv, runs `validateEnv()`, tests DB with `testConnection()`, then starts the Express app. Missing required vars in production cause exit(1).

---

## 9. Rate Limiting and Security

- **General API:** 100 requests per 15 minutes per IP (skip `/api/health`).
- **Auth (login/register):** 50 per 15 minutes per IP (overridable by `AUTH_RATE_LIMIT_MAX`).
- **Device push/webhook:** 200 requests per minute per IP.
- **Helmet** is used (CSP can be disabled if needed). **CORS** is configured (origin from env or `*`). Passwords hashed with **bcrypt**. **Parameterized queries** only (no raw SQL concatenation) to avoid SQL injection.

---

## 10. Frontend Technical Notes

- **Vite:** Dev server on port 5173; proxy `/api` to backend (e.g. `http://localhost:3000`). Build outputs static assets; API base is same origin in dev or configurable for production.
- **Auth:** AuthContext stores token and user; `authFetch()` adds `Authorization: Bearer <token>` and handles 401 (e.g. redirect to login).
- **Routes:** React Router; `/login`, `/register`, `/admin` public; rest under `ProtectedRoute` and `DashboardLayout` (sidebar: Dashboard, Employees, Attendance, Payroll, Advances, Reports, Shifts, Devices, Company).
- **Subscription:** Banner and feature disabling use `getSubscriptionStatus(company)` (mirrors backend grace/expiry logic). Company fetched from `GET /api/company` in layout.

---

## 11. Connector (On-Site Sync)

- **Role:** Run on a Windows/Mac PC on the same network as the biometric device. Polls device (TCP, ZKTeco protocol via `zk-attendance-sdk`), assigns IN/OUT by time order and minimum break (e.g. 30 min), then **POST /api/device/push** with `x-device-key` and body `{ logs: [ { employee_code, punch_time, punch_type } ] }`.
- **Config:** `config.json` in same folder as executable: `deviceIp`, `devicePort`, `deviceApiKey`, `backendUrl`, `pollIntervalMs`.
- **Install:** Windows: `install-windows.bat` (run as Administrator) to install as a service / startup task. Mac: `install-mac.sh`. Client setup guide: `connector/SETUP_GUIDE_CLIENTS.txt`.
- **Build:** `pkg` in connector builds standalone `connector.exe` (Windows) or macOS binary so clients don’t need Node installed.

---

## 12. Key Backend Services (Logic)

- **attendanceService** — Daily/monthly attendance aggregation from `attendance_logs`; shift-aware present/absent/late/overtime; uses company holidays and weekly offs.
- **payrollService** — Uses attendance summary, shift rules (late/lunch over deduction, no-leave incentive), advances, holidays; computes gross, deductions, advance, no_leave_incentive, net; upserts `payroll_records`.
- **holidayService** — company_holidays + company_weekly_offs (or shift weekly_off_days); `getHolidayDatesForMonth` for payroll working-day logic.
- **deviceService** — CRUD devices, validate API key, process incoming logs (match employee by employee_code, insert attendance_logs, update device last_seen_at). Subscription check can be applied before processing.
- **onboardingService** — Derives checklist from DB: company profile complete, has shift, has employee, has device, device has synced (last_seen_at), has payroll record; returns steps and progress percentage.

---

## 13. Deployment (Summary)

- **Backend:** Node 18+, `npm install`, `npm run migrate`, `npm start` (or PM2). Environment variables must be set (no .env in repo).
- **Frontend:** Build with `npm run build`; serve static files (e.g. Nginx) and proxy `/api` to backend, or use same origin if frontend is served from backend.
- **Database:** PostgreSQL; run migrations before first start; backups recommended.
- **Connector:** Distributed as executable + `config.example.json` and client setup guide; clients copy to config.json and run installer.

---

## 14. References

- **Product and features:** `Docs/PRODUCT_OVERVIEW_FOR_MARKETING.md`
- **High-level architecture and modules:** `Docs/APP_ARCHITECTURE.md`
- **Local run:** Root `README.md` (DB create, backend/frontend dev, optional seed, admin approval curl)
- **Client device setup:** `connector/SETUP_GUIDE_CLIENTS.txt`

---

*This technical overview is intended for developers and DevOps. Update as APIs, env, or schema change.*
