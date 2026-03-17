Below is your **complete high-level architecture document** in Markdown format.
You can copy this into:


This is written as a long-term reference document for development, scaling, and maintenance.

---

# Attendance & Payroll SaaS

## Application Architecture Document

---

# 1. Product Vision

## Goal

Build a **cloud-based multi-tenant attendance and payroll management system** for factories and SMEs that:

* Connects with biometric machines
* Automates attendance tracking
* Generates payroll
* Provides clear reports
* Requires minimal technical knowledge
* Is sold as:

  * ₹25,000 one-time
  * ₹7,000 annual renewal
  * Cloud-based

---

# 2. Architecture Overview

## Core Stack

### Backend

* Node.js 18+
* Express.js
* PostgreSQL
* JWT authentication
* bcrypt password hashing
* PM2 process manager
* Nginx reverse proxy
* Let’s Encrypt SSL

### Frontend

* React (Vite)
* TailwindCSS v4
* Recharts (charts)
* React Router DOM

### Hosting

* Single 2GB VPS
* Ubuntu
* PostgreSQL installed locally
* Nginx reverse proxy
* PM2 for process management

### Architecture Pattern

* Single Database
* Multi-tenant (company_id isolation)
* API-first design
* Modular services architecture

---

# 3. System Architecture

**Primary (Direct Cloud Push):** Device pushes each punch to cloud over HTTP. No on-site software.

```
Biometric Device (Cloud server setting)
       ↓ HTTP POST /api/device/webhook  (with API key in header)
Express Backend
       ↓
PostgreSQL (Single DB, Multi-tenant)
       ↓
React Frontend (Dashboard + Admin UI)
```

**Optional (Connector):** For LAN-only or legacy devices, an on-site connector pulls from device (TCP) and pushes to the same API.

```
Biometric Device (Ethernet) ←→ Connector (on-site) → POST /api/device/push → Express Backend → ...
```

---

# 4. Multi-Tenant Design

## Strategy

Single PostgreSQL database with strict tenant isolation.

Every business table contains:

```
company_id (FK)
```

All queries must:

* Filter by `company_id`
* Never trust client-provided company_id
* Use `req.companyId` from JWT

---

# 5. Database Architecture

## Core Tables

### 1. companies

* id
* name
* email
* phone
* address
* subscription_start_date
* subscription_end_date
* is_active
* onboarding_completed_at
* created_at

---

### 2. users

* id
* company_id
* name
* email
* password_hash
* role (admin, hr, employee)
* is_active
* created_at

---

### 3. employees

* id
* company_id
* name
* employee_code
* basic_salary
* join_date
* status (active, inactive)
* department
* created_at

Indexes:

* (company_id, employee_code)
* (company_id, name)

---

### 4. shifts

* id
* company_id
* name
* start_time
* end_time
* grace_minutes
* created_at

---

### 5. devices

* id
* company_id
* name
* api_key
* is_active
* last_seen_at
* created_at

---

### 6. attendance_logs

* id
* company_id
* employee_id
* punch_time
* punch_type (in/out)
* device_id
* created_at

Indexes:

* (company_id, employee_id, punch_time DESC)

---

### 7. payroll_records

* id
* company_id
* employee_id
* year
* month
* total_days
* present_days
* overtime_hours
* gross_salary
* deductions
* salary_advance
* net_salary
* generated_at

Unique:

* (company_id, employee_id, year, month)

---

### 8. audit_logs

* id
* company_id
* user_id
* action_type
* entity_type
* entity_id
* metadata (JSON)
* created_at

---

# 6. Core Modules

---

# MODULE 1: Authentication & Authorization

## Features

* Company registration
* Admin user creation
* Login
* JWT token issuance
* Role-based access control
* Company isolation enforcement

## Middleware

* authenticate
* requireRole()
* enforceCompanyFromToken
* optionalAuth

---

# MODULE 2: Onboarding System

## Purpose

Guide factory owner to full setup.

## Steps

1. Add company details
2. Create shift
3. Add first employee
4. Register device
5. Verify device sync
6. Generate first payroll

## Endpoint

```
GET /api/onboarding/status
```

## Logic

Derived from real data (no manual checkboxes).

---

# MODULE 3: Employee Management

## Features

* Create employee
* Update employee
* Deactivate employee
* Search by name/code
* Pagination
* Modern card UI

## Backend

* Service layer abstraction
* Validation layer
* Company isolation enforced

---

# MODULE 4: Device Management

## Features

* Register device
* Generate secure API key
* Regenerate API key
* Activate/Deactivate device
* View last seen timestamp
* Online/offline indicator

## Security

* Device push authenticated via API key
* Device key unique per company

---

# MODULE 5: Biometric Device Sync

## Endpoints

* **Direct Cloud Push (recommended):** `POST /api/device/webhook` — device sends punches to cloud; auth via `x-device-key: API_KEY` or `Authorization: Bearer API_KEY`; accepts JSON or ZKTeco tab-separated payloads.
* **Ping:** `GET /api/device/ping` — device connectivity check (returns OK).
* **Connector push (optional):** `POST /api/device/push` — on-site connector sends bulk logs; auth via `x-device-key`; body `{ logs: [...] }`.

## Requirements

* API key authentication (per device, per company)
* Bulk or single-punch insert; partial push (skip unknown employee_code)
* Transaction-based; update device last_seen_at
* Validate employee codes; fast processing

---

# MODULE 6: Attendance Engine

## Features

* Daily attendance view
* Monthly attendance calendar
* Late detection
* Overtime calculation
* Absence detection
* Shift-aware logic

## Computation

* Group logs by date
* Pair IN → OUT
* Calculate worked duration
* Compare against shift

---

# MODULE 7: Payroll Engine

## Features

* Monthly payroll generation
* Attendance summary integration
* Overtime calculation
* Absence deduction
* Upsert payroll record
* Regenerate payroll

## Formula

```
dailyRate = basicSalary / daysInMonth
hourlyRate = dailyRate / 8

overtimePay = overtimeHours * hourlyRate
absenceDeduction = absenceDays * dailyRate

grossSalary = basicSalary + overtimePay
netSalary = grossSalary - deductions - salaryAdvance
```

---

# MODULE 8: Reports Engine

## Required Reports

* Monthly attendance report
* Overtime report
* Salary summary report
* Employee-wise attendance
* Payroll export (CSV)

## Performance

* Use indexed queries
* Pre-aggregate if necessary

---

# MODULE 9: Dashboard Analytics

## Widgets

* Total employees
* Today attendance %
* Monthly payroll total
* Attendance trend (Area chart)
* Payroll snapshot

## Endpoints

```
GET /api/dashboard/summary
GET /api/dashboard/attendance-trend
```

---

# MODULE 10: Subscription & Renewal System

## Business Model

₹25,000 one-time
₹7,000 annual renewal

## Fields

* subscription_start_date
* subscription_end_date
* is_active

## Logic

Middleware checks:

* If expired → restrict features
* Show renewal banner

---

# MODULE 11: WhatsApp Support Integration

## Features

* Floating help button
* Auto-fill company ID
* Direct WhatsApp link

```
https://wa.me/<number>?text=CompanyID:XYZ
```

---

# MODULE 12: Audit Logging

## Track

* Employee creation
* Payroll generation
* Device registration
* Salary changes
* Login events

## Purpose

* Legal protection
* Dispute handling
* Activity traceability

---

# 7. Security Architecture

## Must-Have Controls

* JWT expiration
* Password hashing (bcrypt)
* Role-based access
* Company data isolation
* API key validation
* SQL injection prevention (parameterized queries)
* CORS configuration
* Rate limiting (future)
* Helmet (future)

---

# 8. Performance Strategy

## Index Strategy

* company_id on all major tables
* employee_code composite index
* attendance_logs time index
* payroll period index

## Scaling Plan

Phase 1:

* Single 2GB VPS

Phase 2:

* Upgrade to 4GB VPS
* Add Redis caching (optional)

Phase 3:

* Separate DB server

---

# 9. UI/UX Philosophy

## Principles

* No boring tables
* Card-based layouts
* Color-coded statuses
* Clean dashboard
* Soft shadows
* Rounded-xl components
* Fast interactions
* Minimal clicks

Factories are not tech users.

Clarity > Complexity.

---

# 10. Future Enhancements (Not Now)

* Mobile app
* SMS alerts
* Multi-shift auto-assignment
* Leave management
* Salary advances tracking
* PDF payslips
* Role-based dashboards
* Super-admin panel

---

# 11. Deployment Architecture

## VPS Structure

```
/var/www/app
   backend/
   frontend/
   ecosystem.config.js
```

## Services

* Node (PM2)
* PostgreSQL
* Nginx
* SSL (Let’s Encrypt)

---

# 12. Operational Checklist Before Selling

* SSL working
* Backups automated
* Device sync tested
* Payroll generation tested
* Export reports tested
* Onboarding tested
* Renewal logic tested

---

# 13. Core Product Flow

1. Company registers
2. Admin logs in
3. Onboarding checklist appears
4. Shift created
5. Employees added
6. Device registered
7. Device sends logs
8. Attendance visible
9. Payroll generated
10. Reports exported
11. Annual renewal collected

---

# 14. Long-Term Goal

Turn this from:

“Attendance software”

Into:

“Factory workforce management system”

But first:

Perfect attendance + payroll.

---

# Final Rule

Before adding any new feature, ask:

* Does it increase renewal rate?
* Does it reduce support calls?
* Does it make payroll easier?
* Does it improve device sync reliability?

If not, don’t build it.

---

This document is now your blueprint.

---
