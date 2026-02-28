Perfect. Now we move from “vision” to **execution discipline**.

Below is your **Sprint-Level Technical Execution Plan** designed for:

* 1 primary developer (you)
* 6–8 week delivery
* Production-ready SaaS
* Sellable after Phase 1

This is structured like a real startup roadmap.

---

# 🚀 ATTENDANCE & PAYROLL SaaS

# Technical Sprint Execution Plan

---

# 🔵 PHASE 0 — Foundation Stabilization (Week 0.5)

### Goal:

Harden what’s already built before expanding.

### Tasks:

#### Backend

* [ ] Add global response format consistency
* [ ] Add centralized asyncHandler wrapper
* [ ] Add request logging (morgan)
* [ ] Add production error hiding
* [ ] Add DB connection retry logic
* [ ] Add environment validation (required .env keys)

#### Database

* [ ] Add missing indexes
* [ ] Add foreign key constraints everywhere
* [ ] Add ON DELETE rules (RESTRICT or CASCADE carefully)

#### DevOps

* [ ] Setup PM2 ecosystem file
* [ ] Setup Nginx config template
* [ ] Enable HTTPS with Let’s Encrypt
* [ ] Add automatic DB backup script (daily cron)

---

# 🔵 PHASE 1 — Core Operational Completion (Weeks 1–2)

### 🎯 Objective:

Make product fully usable for 1 real client.

---

## Sprint 1A — Onboarding System

### Backend

* [ ] Create onboardingService
* [ ] Create GET /api/onboarding/status
* [ ] Add onboarding_completed_at field

### Frontend

* [ ] Build OnboardingChecklist component
* [ ] Add progress bar
* [ ] Add route navigation
* [ ] Auto-open modals for incomplete steps
* [ ] Celebration state on completion

---

## Sprint 1B — Device Management Module

### Backend

* [ ] POST /api/devices
* [ ] GET /api/devices
* [ ] PUT /api/devices/:id
* [ ] Regenerate API key
* [ ] Activate/Deactivate device

### Frontend

* [ ] Device list page
* [ ] Show API key (masked + copy button)
* [ ] Online/offline indicator
* [ ] Last seen timestamp
* [ ] Regenerate key confirmation modal

---

## Sprint 1C — Attendance Viewer

### Backend

* [ ] GET daily attendance endpoint
* [ ] GET monthly attendance summary
* [ ] Overtime detection refinement
* [ ] Late detection logic

### Frontend

* [ ] Calendar-style monthly attendance view
* [ ] Color-coded status days
* [ ] Filter by employee
* [ ] Today summary card

---

### ✅ Milestone 1:

Product ready for first paid deployment.

---

# 🔵 PHASE 2 — Business-Grade Features (Weeks 3–4)

### 🎯 Objective:

Make it competitive & renewal-worthy.

---

## Sprint 2A — Payroll UI Completion

### Backend

* [ ] GET payroll records (paginated)
* [ ] Regenerate payroll endpoint
* [ ] Lock payroll after confirmation
* [ ] Audit log on payroll generation

### Frontend

* [ ] Payroll listing page
* [ ] Monthly payroll generator UI
* [ ] Confirmation modal before generation
* [ ] Net salary breakdown visual
* [ ] Highlight overtime & deductions visually

---

## Sprint 2B — Reports Engine

### Backend

* [ ] Monthly attendance export (CSV)
* [ ] Payroll export (CSV)
* [ ] Overtime summary export

### Frontend

* [ ] Reports page
* [ ] Download buttons
* [ ] Date range picker

---

## Sprint 2C — Audit Logging System

### Backend

* [ ] Create audit_logs table
* [ ] Create audit service
* [ ] Log:

  * Employee create/update
  * Payroll generate
  * Device registration
  * Login

### Admin Tool

* [ ] Simple audit viewer page (admin only)

---

### ✅ Milestone 2:

Enterprise-grade credibility.

---

# 🔵 PHASE 3 — Revenue Protection (Week 5)

### 🎯 Objective:

Protect your ₹7,000 renewals.

---

## Sprint 3A — Subscription & Renewal System

### Backend

* [ ] Add subscription fields
* [ ] Middleware to check expiry
* [ ] Grace period logic (7 days)
* [ ] Renewal update endpoint (admin use)

### Frontend

* [ ] Expiry warning banner
* [ ] Renewal countdown
* [ ] Block payroll if expired

---

## Sprint 3B — WhatsApp Support Integration

### Frontend

* [ ] Floating help button
* [ ] Auto include company ID
* [ ] Auto include logged-in user name

---

### ✅ Milestone 3:

Revenue secured.

---

# 🔵 PHASE 4 — Performance & Polish (Week 6)

### 🎯 Objective:

Make it feel premium.

---

## Backend

* [ ] Optimize heavy queries
* [ ] Add DB query logging in dev
* [ ] Improve payroll calculation efficiency
* [ ] Add pagination everywhere

---

## Frontend

* [ ] Replace remaining tables with visual layouts
* [ ] Add loading skeletons
* [ ] Improve transitions
* [ ] Improve empty states
* [ ] Add better chart visuals

---

# 🔵 PHASE 5 — Production Hardening (Week 7–8)

### 🎯 Objective:

Ready for multiple clients.

---

## Infrastructure

* [ ] VPS auto-restart setup
* [ ] Memory monitoring
* [x] PM2 restart on crash (`ecosystem.config.js`, `max_memory_restart`, `autorestart`)
* [ ] Log rotation (OS/cron or PM2 log rotate module)
* [x] Database automated backups (`scripts/db-backup.sh`; schedule via cron)
* [x] Restore test backup (`scripts/db-restore-test.sh`)

---

## Security

* [x] Add Helmet
* [x] Add rate limiting (API + auth + device push limiters)
* [x] Hide stack traces in prod (in `errorHandler`)
* [ ] Validate all inputs strictly (add as needed per route)
* [x] Remove console logs (only `console.error` for 5xx/audit; dev-only query log)

---

# 🔵 OPTIONAL PHASE — Scaling Prep (Future)

* [ ] Add Redis caching (dashboard stats)
* [ ] Add read-replica DB
* [ ] Separate DB server
* [ ] Add super-admin panel
* [ ] Add centralized monitoring

---

# 📊 Time Allocation (Realistic)

| Phase   | Time      |
| ------- | --------- |
| Phase 0 | 3 days    |
| Phase 1 | 2 weeks   |
| Phase 2 | 2 weeks   |
| Phase 3 | 1 week    |
| Phase 4 | 1 week    |
| Phase 5 | 1–2 weeks |

Total: ~6–8 weeks for production SaaS.

---

# 🧠 Parallel Strategy

While building:

* Deploy for 1 friend client early
* Get real biometric data flowing
* Fix edge cases immediately
* Collect UI feedback

Never build in isolation.

---

# 📈 What Makes This Scalable

You now have:

* Clear tenant isolation
* Revenue protection
* Operational onboarding
* Payroll automation
* Audit protection
* Device reliability
* Cloud deployment

This is no longer “attendance software”.

This is a **business system**.

---

We follow this strictly.
