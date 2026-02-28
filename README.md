# Attendance SaaS

SaaS attendance and payroll system — backend (Node.js + Express) and frontend.

## Test locally

1. **PostgreSQL** — Create a database (e.g. `createdb attendance_saas`).

2. **Backend**
   ```bash
   cd backend
   cp .env.example .env    # edit DB_* and JWT_SECRET
   npm install
   npm run migrate         # run migrations
   npm run seed            # optional: demo company + admin (admin@demo-company.com / Admin@123)
   npm run dev             # runs on http://localhost:3000
   ```

3. **Frontend** (in another terminal)
   ```bash
   cd frontend
   npm install
   npm run dev             # runs on http://localhost:5173, proxies /api to backend
   ```

4. **Try it** — Open http://localhost:5173. If you didn’t seed: register a company + admin, then log in. If you seeded: log in with `admin@demo-company.com` / `Admin@123`.

## Company approval (you control who gets in)

New company registrations are created with status **pending**. They cannot log in until you approve (e.g. after the client pays).

- **List pending:**  
  `curl -H "X-Approval-Secret: YOUR_ADMIN_APPROVAL_SECRET" http://localhost:3000/api/admin/pending-companies`
- **Approve a company (after payment):**  
  `curl -X POST -H "Content-Type: application/json" -H "X-Approval-Secret: YOUR_ADMIN_APPROVAL_SECRET" -d '{"company_id":2}' http://localhost:3000/api/admin/approve-company`

Set `ADMIN_APPROVAL_SECRET` in `backend/.env` (see `.env.example`). Keep it secret.

**Super-admin UI:** Open `/admin` (or use "Manage pending registrations" on the login page), enter your `ADMIN_APPROVAL_SECRET`, then approve or decline each pending registration.

## Project structure

```
attendance-saas/
├── backend/
│   ├── src/
│   │   ├── config/      # DB and app config
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   └── app.js
│   ├── server.js
│   └── package.json
├── frontend/
└── README.md
```

## Backend setup

1. **Install dependencies**

   ```bash
   cd backend && npm install
   ```

2. **Environment**

   Copy `backend/.env.example` to `backend/.env` and set your PostgreSQL and JWT values.

3. **Database**

   Create a PostgreSQL database (e.g. `attendance_saas`) and ensure `.env` matches your connection.

4. **Run**

   ```bash
   npm run dev   # development with watch
   npm start     # production
   ```

- Health check: `GET /api/health`
- API runs on `PORT` (default `3000`).

## Auth

- **POST /api/auth/register** — Create company + first admin. Body: `{ company: { name, email?, phone?, address? }, admin: { name, email, password } }`
- **POST /api/auth/login** — Body: `{ email, password }`. Returns `{ user, token }`.
- **GET /api/auth/me** — Current user from JWT. Header: `Authorization: Bearer <token>`.

Protected routes: use `authenticate`, then optionally `requireRole(['admin','hr'])` and `enforceCompanyFromToken`. Always use `req.companyId` (from JWT), never `req.body.company_id`.

## Stack

- **Runtime:** Node.js 18+
- **Framework:** Express
- **DB:** PostgreSQL (`pg`)
- **Auth:** JWT, bcrypt
- **Env:** dotenv
