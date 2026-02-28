### High-level implementation roadmap

I’ll structure this as an ordered, concrete checklist you can track.

#### 1) Finish Device Management (Phase 1B)

- **Backend**
  - **1.1** Extend `devices` service (`deviceService.js`):
    - Add: `createDevice(companyId, { name })` → generates secure `api_key`.
    - Add: `listDevices(companyId)` → returns all devices with `last_seen_at`, `is_active`.
    - Add: `updateDevice(companyId, id, { name })`.
    - Add: `toggleDeviceActive(companyId, id, isActive)`.
    - Add: `regenerateApiKey(companyId, id)` → new key, returns masked+full key.
  - **1.2** Extend `routes/device.js` and create controller:
    - `GET /api/device` (list).
    - `POST /api/device` (create).
    - `PUT /api/device/:id` (update name).
    - `POST /api/device/:id/regenerate-key`.
    - `PATCH /api/device/:id/activate` / `deactivate` (or a single toggle body).
    - All protected by `authenticate`, `requireRole(['admin','hr'])`, `enforceCompanyFromToken`.

- **Frontend**
  - **1.3** Implement `DevicesPage.jsx` fully:
    - Fetch from `/api/device` and show:
      - Device name, status pill (online/offline from `last_seen_at`), `last_seen_at` relative time.
      - Masked API key with “Copy” button (reveals on click or second button).
    - “+ Register device” modal with name field → POST `/api/device`.
    - Action buttons:
      - “Regenerate key” → confirm modal → calls `/api/device/:id/regenerate-key`.
      - “Activate/Deactivate” → toggle endpoints.

#### 2) Attendance Viewer (Phase 1C)

- **Backend**
  - **2.1** Implement attendance endpoints:
    - `GET /api/attendance/daily?date=YYYY-MM-DD&employee_id?=`:
      - Returns per-employee status for the date (present/absent/late/overtime flag).
    - `GET /api/attendance/monthly?year=&month=&employee_id?=`:
      - Re-use `getAttendanceSummary` + per-day breakdown.
  - **2.2** Extract shared attendance logic from `payrollService` into `attendanceService` (or keep functions there and call).

- **Frontend**
  - **2.3** Create `AttendancePage.jsx`:
    - Monthly calendar view (Tailwind + simple grid).
    - Color-coded days: present/absent/late.
    - Employee filter dropdown.
    - Today summary card (for whole company and/or selected employee).

#### 3) Payroll UI & listing (Phase 2A basics)

- **Backend**
  - **3.1** Add `GET /api/payroll`:
    - Query: `year`, `month`, `page`, `limit`, `employee_id?`.
    - Returns list of payroll records + pagination.
  - **3.2 (later)** Add a `locked` boolean to `payroll_records` and honor it.

- **Frontend**
  - **3.3** Enhance `PayrollPage.jsx`:
    - List payroll rows (employee, month, net salary, overtime, deductions).
    - Filters by month/year and employee.
    - “Generate payroll” modal using existing `POST /api/payroll/generate`.
    - Confirmation dialog before generation.

#### 4) Audit Logging (Phase 2C)

- **Backend**
  - **4.1** Add migration for `audit_logs` table.
  - **4.2** Create `auditService.log(companyId, userId, actionType, entityType, entityId, metadata)`.
  - **4.3** Hook into:
    - Employee create/update/deactivate.
    - Payroll generate.
    - Device create/regenerate/toggle.
    - Login/register.

- **Frontend**
  - **4.4** Simple `AuditPage.jsx` (admin only):
    - Paginated table of recent actions with filters.

#### 5) Subscription & Renewal (Phase 3A)

- **Backend**
  - **5.1** Extend `companies` table:
    - Add `subscription_start_date`, `subscription_end_date`, `is_active`.
  - **5.2** Add middleware `checkSubscription`:
    - If expired + beyond grace period → block critical routes (payroll, device push, etc.).
  - **5.3** Add admin-only endpoint:
    - `POST /api/company/subscription` to update/extend subscription dates.

- **Frontend**
  - **5.4** Add:
    - Global renewal banner in `DashboardLayout` when near expiry.
    - Block actions (e.g. payroll generate) with explanatory message.

#### 6) Reports Engine (Phase 2B)

- **Backend**
  - **6.1** `GET /api/reports/attendance.csv`.
  - **6.2** `GET /api/reports/payroll.csv`.
  - **6.3** `GET /api/reports/overtime.csv`.

- **Frontend**
  - **6.4** `ReportsPage.jsx`:
    - Date range + buttons that hit above endpoints and trigger file download.

#### 7) WhatsApp Support (Phase 3B)

- **Frontend**
  - **7.1** Floating `Help` button component:
    - Uses `companyId` and user name (from `/api/auth/me`) to prefill WhatsApp `text` query in `wa.me` link.

#### 8) DevOps & Security Hardening (Phases 0 & 5)

- **8.1** Add `morgan` logging in `app.js` (dev).
- **8.2** Add `helmet` and basic rate-limiting middleware.
- **8.3** Add a small `config/validateEnv.js` to assert required env vars at startup.
- **8.4** Add `ecosystem.config.js` for PM2.
- **8.5** Add sample Nginx config + `scripts/db-backup.sh` and `db-restore-test.sh`.

---

