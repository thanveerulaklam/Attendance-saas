# Multi-branch & admin overrides — validation checklist

Run after `npm run migrate` (migration `031_branches_scoping_and_limits.sql`).

## HR branch visibility

- [ ] HR user assigned only to Branch A: employees list, devices list, departments, daily/monthly attendance, payroll list, reports CSV, dashboard summary only include Branch A data.
- [ ] HR cannot open another branch’s employee by id (404).
- [ ] HR cannot create employee/device with `branch_id` outside assigned branches (403).
- [ ] Admin sees all branches (no filtering).

## Superadmin assignments (immediate)

- [ ] After `POST /api/admin/set-user-branch-assignments`, next HR request reflects new branches without re-login.

## Device ingestion

- [ ] Punch from device is stored with `attendance_logs.branch_id` = device’s `branch_id`.
- [ ] Employee on Branch B punching on Branch A device is skipped / rejected (connector response lists skipped codes when mixed batch).

## Employee limit override

- [ ] `POST /api/admin/set-company-employee-limit` with integer caps active employees; `null` restores plan-based limit.
- [ ] Creating active employee when at cap returns 403 with limit message.
- [ ] Reducing cap below current active count blocks new activations until count drops.

## Admin portal

- [ ] `admin-portal.html` → Details loads `/api/admin/company-details`, shows branches, stats, HR assignments.
- [ ] Save limit and HR branch assignments succeed with valid secret.

## Automated tests

- `node --test backend/test/attendance-hours-based.test.js`
- `node --test backend/test/branch-scope.test.js` (if present)
