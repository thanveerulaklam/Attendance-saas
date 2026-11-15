# Deploy frontend and backend (punchpay.in)

Copy-paste guide for updating **production** at `https://punchpay.in`.

| Item | Value |
|------|--------|
| VPS | `root@143.110.251.182` |
| App path | `/var/www/Attendance-saas` |
| Backend process | `pm2` app name `attendance-api` |
| Frontend live files | `/var/www/Attendance-saas/frontend/dist` |
| Git branch | `main` |

Do **not** put `.env`, passwords, or keystores in git.

---

## 0. Commit and push first (your Mac)

Never deploy uncommitted work. On your laptop:

```bash
cd /path/to/Attendance-saas
git status
git add -A
git commit -m "your message"
git push origin main
```

If you worked on a feature branch, merge it to `main` (or merge the PR) **before** the VPS pull.

---

## 1. SSH into the VPS

```bash
ssh root@143.110.251.182
```

If git later complains `dubious ownership`, run this once, then continue:

```bash
git config --global --add safe.directory /var/www/Attendance-saas
```

---

## 2. Always: pull `main`

```bash
cd /var/www/Attendance-saas
git fetch origin main
git pull origin main
git log -1 --oneline
```

You should see the commit you just pushed.

If `git pull` refuses because the server has local edits, **only if you are sure those edits are junk**:

```bash
cd /var/www/Attendance-saas
git fetch origin main
git reset --hard origin/main
```

That throws away uncommitted files on the server. It does **not** delete `.env`.

---

## 3. Pick what you changed

| What you changed | Run |
|------------------|-----|
| Frontend only (pages, CSS, React) | Step 4 |
| Backend only (API, services, no new SQL) | Step 5 |
| New or changed `backend/migrations/*.sql` | Step 5 **and** Step 6 |
| `backend/package.json` or `frontend/package.json` | add `npm install` in that folder (included below) |
| Both UI and API | Step 4 then Step 5 (and Step 6 if there is a new migration) |

---

## 4. Frontend only

Rebuilds `frontend/dist`. Nginx already serves that folder. No `pm2` restart needed.

```bash
cd /var/www/Attendance-saas/frontend
npm install
npm run build
```

Wait until you see `✓ built`. Then hard-refresh the browser (`Cmd+Shift+R`).

---

## 5. Backend only (no new migration)

```bash
cd /var/www/Attendance-saas/backend
npm install
pm2 restart attendance-api
pm2 list
```

`attendance-api` must be **online**. Check it:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://punchpay.in/api/health
```

Expected: `200`.

Logs if something is wrong:

```bash
pm2 logs attendance-api --lines 50
tail -n 50 /var/www/Attendance-saas/backend/logs/err.log
```

---

## 6. Backend + new database migration

Only when you added a file under `backend/migrations/`.

```bash
cd /var/www/Attendance-saas/backend
npm install
npm run migrate
pm2 restart attendance-api
curl -s -o /dev/null -w "%{http_code}\n" https://punchpay.in/api/health
```

If migrate says a file is already applied but the table/column is missing, fix that in code first (do not hand-edit production SQL unless you know the schema). Then restart `attendance-api` again.

---

## 7. Both frontend and backend (most common)

Copy this whole block after you have SSH’d in and pulled `main` (Step 2). Skip `npm run migrate` if you did **not** add a migration.

```bash
cd /var/www/Attendance-saas
git fetch origin main
git pull origin main

cd /var/www/Attendance-saas/backend
npm install
npm run migrate
pm2 restart attendance-api

cd /var/www/Attendance-saas/frontend
npm install
npm run build

pm2 list
curl -s -o /dev/null -w "%{http_code}\n" https://punchpay.in/api/health
```

Then hard-refresh `https://punchpay.in`.

---

## 8. One-liners from your Mac (no interactive SSH)

Replace nothing except if your SSH user is not `root`.

**Frontend only** (code already on `origin/main`):

```bash
ssh root@143.110.251.182 'cd /var/www/Attendance-saas && git pull origin main && cd frontend && npm run build'
```

**Backend only** (no migration):

```bash
ssh root@143.110.251.182 'cd /var/www/Attendance-saas && git pull origin main && cd backend && pm2 restart attendance-api'
```

**Both, including migrate:**

```bash
ssh root@143.110.251.182 'cd /var/www/Attendance-saas && git pull origin main && cd backend && npm install && npm run migrate && pm2 restart attendance-api && cd /var/www/Attendance-saas/frontend && npm install && npm run build'
```

---

## 9. Quick checks after deploy

```bash
# On the VPS
cd /var/www/Attendance-saas
git log -1 --oneline
pm2 list
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/health
```

| Check | Expect |
|-------|--------|
| `git log -1` | The commit you pushed |
| `pm2 list` | `attendance-api` **online** |
| Health URL | `200` |
| Browser | Hard refresh; you should see the new UI |

Nginx does not need a reload for a normal frontend `npm run build` or backend restart.

---

## If something fails

**`git pull` — “Your local changes would be overwritten”**  
See Step 2 `git reset --hard origin/main`. Only if server edits are not needed.

**Frontend build error (JSX / Vite)**  
Fix on your laptop, commit, push, then run Step 4 again. Do not ship a broken `dist`.

**API 500 after pull**  
Usually a missing migration. Run Step 6, then `pm2 logs attendance-api --lines 80`.

**502 Bad Gateway**  
Backend is down:

```bash
pm2 status
pm2 restart attendance-api
pm2 logs attendance-api --lines 50
```

**Site shows old UI**  
Hard refresh, or wait a few seconds for `frontend/dist` to finish writing, then refresh again.
