# Multi-branch setup guide

One **company account** can have many **branches** (locations). The **company admin** sees all branches. **HR users** only see data for branches you assign. **Superadmin** (you) controls HR branch access, default branch per HR user, and per-company **employee limits** (for pricing).

---

## 1. Deploy the database

1. Run migrations on the server (includes `031_branches_scoping_and_limits.sql`):

   ```bash
   cd backend && npm run migrate
   ```

2. Existing companies get a default **Main** branch; existing employees, devices, and attendance rows are backfilled.

---

## 2. Company admin — day-to-day (in the app)

### Create branches

1. Log in as **Company admin** (role `admin`).
2. Open **Company → Settings** (or your company profile page).
3. Under **Branches**, add each physical location (name + optional address).
4. The first branch after signup is often **Main**; add more as needed (e.g. “Chennai plant”, “Warehouse”).

### Employees and devices

1. **Employees** → Add employee: choose **Branch** (required if there is more than one branch; otherwise it defaults).
2. **Devices** → Register device: choose **Branch**. Punches from that device are stored with that branch’s `branch_id` (employees must belong to the same branch as the device).

### HR users

- Create HR users as usual (if your app supports inviting users).  
- **Which branches each HR user can see** is **not** set by the company admin in the product UI today — you set that as superadmin (see below).

---

## 3. Superadmin — what you control

Use the **Admin** secret (`ADMIN_APPROVAL_SECRET`) and either:

- **`frontend/public/admin-portal.html`** (hosted with your API), or  
- Direct API calls with header `X-Approval-Secret: <your secret>`.

### A. Customer overview

- `GET /api/admin/overview` — list companies, counts, billing fields.

### B. Per-customer details (branches, HR assignments, limits)

- `GET /api/admin/company-details?company_id=<id>`  
  Returns: billing, effective employee limit, branches + active headcount per branch, HR users + branch assignments, device/employee counts.

### C. HR branch access (per user)

- `POST /api/admin/set-user-branch-assignments`  
  Body:

  ```json
  {
    "company_id": 1,
    "user_id": 123,
    "branch_ids": [1, 2],
    "default_branch_id": 1
  }
  ```

  Rules:

  - `user_id` must be an **HR** user in that company.
  - `branch_ids` must be valid branch IDs for that company.
  - `default_branch_id` must be one of `branch_ids` (if omitted, the first ID in `branch_ids` is used as default).
  - Changes apply on the **next API request** (no logout required).

### D. Employee limit override (pricing)

- `POST /api/admin/set-company-employee-limit`  
  Body:

  ```json
  {
    "company_id": 1,
    "employee_limit_override": 150
  }
  ```

  Use `null` to clear the override and go back to the plan-based limit.

---

## 4. API reference for the tenant app (branch pickers)

| Endpoint | Who | Purpose |
|----------|-----|---------|
| `GET /api/company/branches` | Admin + HR | List branches (HR only sees **assigned** branches). |
| `POST /api/company/branches` | **Admin only** | Create a branch (`name`, optional `address`). |
| `POST /api/employees` | Admin + HR | Optional `branch_id` (HR: must be in allowed branches; default uses server default). |
| `POST /api/device` | Admin + HR | `branch_id` required for device registration. |

---

## 5. Quick checklist

- [ ] Migration applied.
- [ ] Company admin created all branches (Settings → Branches).
- [ ] Employees and devices assigned to the correct branch.
- [ ] Superadmin set each HR user’s `branch_ids` + `default_branch_id`.
- [ ] Superadmin set `employee_limit_override` when the contract headcount differs from the plan default.

For automated / manual QA items, see `MULTI_BRANCH_TEST_CHECKLIST.md`.
