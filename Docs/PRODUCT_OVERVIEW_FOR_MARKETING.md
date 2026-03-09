# Attendance SaaS — Product Overview for Marketing

**Purpose:** This document gives marketing teams a clear, non-technical picture of the product so they can craft messaging, positioning, and campaigns. It describes what the product does, who it is for, and how it creates value.

---

## 1. What Is It?

**Attendance SaaS** is a **cloud-based attendance and payroll system** for businesses. It helps companies:

- **Track who is present** (via biometric devices or manual entry)
- **Manage work shifts and rules** (start/end times, lunch, weekly offs, deductions)
- **Calculate monthly payroll** from attendance (salary, overtime, advances, deductions)
- **Export reports** (attendance, payroll, overtime) for records and audits

The product is **multi-tenant**: each customer is a **company** with its own employees, devices, shifts, and payroll. Companies register and are **approved by the provider** (e.g. after payment) before they can use the system. The app is **subscription-based** (start/end dates; payroll and device sync can be restricted when subscription lapses).

**Tagline in app:** *"Modern HR & Payroll"* — real-time insights into attendance and payroll.

---

## 2. Who Is It For?

- **Small and mid-size businesses** that need structured attendance and payroll (e.g. factories, workshops, offices).
- **Companies already using (or planning to use) biometric devices** (fingerprint/face) at the gate or desk.
- **India-oriented use:** salary in **INR**, support for **ESI amount**, **daily travel allowance**, and common payroll rules (late deduction, lunch over deduction, no-leave incentive, advances).

**Ideal customer:** A factory or office that wants to move from paper/Excel to a single system for attendance + payroll, with optional biometric integration and downloadable reports.

---

## 3. Main Features (In Plain Language)

### 3.1 Getting Started

- **Registration:** Company name + one admin (name, email, password). New companies are created as **pending** and cannot log in until the provider **approves** them (e.g. after payment).
- **Login:** Email + password; after login the user sees the **dashboard** and sidebar (Dashboard, Employees, Attendance, Payroll, Advances, Reports, Shifts, Devices, Company).
- **Onboarding checklist:** The app guides new customers through: (1) Add company details, (2) Create a shift, (3) Add first employee, (4) Register device, (5) Verify device sync, (6) Generate first payroll. Progress is shown as a percentage; steps can be dismissed.

---

### 3.2 Dashboard

- **Today’s attendance:** How many employees are present vs total (e.g. “12 / 15”), with a “Real-time” badge.
- **Currently on lunch break:** List of people who have punched out for lunch and not yet punched back in.
- **Today’s absent:** List of employees who have not marked attendance today.
- **Weekly attendance trend:** A simple chart showing “% present” over the last 7 days.

**Marketing angle:** “See who’s in, who’s on break, and who’s absent at a glance.”

---

### 3.3 Employees

- **Add and manage employees:** Name, employee code (unique per company), basic salary, join date, status (e.g. active/inactive), shift, daily travel allowance, ESI amount.
- **Search and filter:** By name/code and by status; paginated list.
- **Edit/update** any employee details.

**Marketing angle:** “One place for your workforce; link each person to a shift and salary so payroll is automatic.”

---

### 3.4 Shifts

- **Define work timings:** Shift name, start time, end time, grace minutes (e.g. 5 min late allowed), lunch minutes.
- **Weekly off days:** Select which days are off (e.g. Sunday, Saturday); these are treated as paid (no loss of pay in payroll).
- **Deductions and incentives:**  
  - Late coming: deduct by minutes and/or amount.  
  - Lunch over: deduct if lunch break exceeds allowed minutes.  
  - No-leave incentive: optional amount paid when employee has no absence (configurable per shift).
- Multiple shifts can exist; each employee is assigned to one shift.

**Marketing angle:** “Set your rules once — late, lunch, weekly off — and the system applies them fairly for everyone.”

---

### 3.5 Devices (Biometric Integration)

- **Register a device:** Give it a name; the system generates an **API key** for that device.
- **Activate / deactivate** devices; **regenerate** API key if needed (e.g. key leaked).
- **Connector:** A small desktop program (Windows or Mac) runs on a PC on the customer’s network. The customer configures: device IP, API key, and backend URL. The connector **pulls punch data from the biometric device** and **sends it to the cloud**. So attendance is captured automatically from the device without manual entry.
- **Last seen:** The app shows when each device last synced, so the customer can verify that data is flowing.

**Marketing angle:** “Use your existing biometric machine; we sync punches to the cloud so you don’t type them in.”

---

### 3.6 Attendance

- **Monthly view:** See attendance by month (and optionally by employee): present days, absent days, late days, overtime hours.
- **Daily view:** For a chosen date, see punch-by-punch (in/out, times).
- **Manual entry:** Add a punch manually (e.g. forgot to punch): choose employee, date, time, in/out; support for “full day” or single punch, and bulk entry for multiple employees.
- **Edit punches:** Correct wrong time or punch type (in/out) for existing records.

**Marketing angle:** “One calendar view of who worked when; fix mistakes or add missing punches in a few clicks.”

---

### 3.7 Payroll

- **Generate payroll:** Select year and month; options include: include overtime, treat holiday-adjacent absence (e.g. Sunday off + Monday absent = 2 days absent), and no-leave incentive. The system computes for each employee: working days, present days, overtime, gross salary, deductions (late, lunch over, etc.), salary advance, no-leave incentive, and **net salary**.
- **List and filter:** View payroll records by year, month, and employee; paginated.
- **Payroll breakdown:** Open a record to see the full detail (present days, total days, overtime hours, gross, deductions, advance, no-leave incentive, net).
- **Subscription:** If the company’s subscription has expired (and grace period is over), payroll generation and device sync are **blocked**; a banner explains this.

**Marketing angle:** “Generate month-end payroll from attendance in one click; see exactly how each rupee is calculated.”

---

### 3.8 Advances

- **Salary advances:** Per employee, per month: enter amount, optional note, and advance date. These amounts are **deducted from that month’s payroll** (net = gross − deductions − advance + incentives, etc.).

**Marketing angle:** “Track advances by month; they’re automatically deducted in payroll.”

---

### 3.9 Reports

- **Download CSV reports** (by year and month):
  - **Attendance report:** Employee code, name, year, month, present days, absent days, late days, overtime hours.
  - **Payroll report:** Employee code, name, year, month, present days, total days, overtime hours, gross salary, deductions, no-leave incentive, net salary.
  - **Overtime report:** Employee code, name, year, month, overtime hours.

**Marketing angle:** “Export clean reports for accounts, audits, or your own records.”

---

### 3.10 Company Settings

- **Company profile:** Name, phone, address (used on payslips and in the app).
- **Subscription:** Start date, end date, active/inactive. Shown as read-only; changes are done by the provider (e.g. after renewal). After end date, a **7-day grace period** is applied before payroll and device sync are restricted.

---

### 3.11 Holidays and Working Days

- The system supports **company holidays** and **weekly off days** (per shift or company-wide). These are used to compute **working days** in the month; holidays and weekly offs are **paid** (no loss of pay). This is configured via shifts (weekly off) and backend (holiday dates); payroll automatically uses this.

**Marketing angle:** “Holidays and weekly offs are paid; only actual working-day absence affects pay.”

---

### 3.12 Support and Admin

- **WhatsApp help:** A floating button opens WhatsApp with pre-filled text (company ID and user email) so support can identify the customer quickly.
- **Super-admin (provider):** A separate admin area allows listing **pending company registrations** and **approving or declining** them (e.g. after payment). This controls who can log in.

---

## 4. How It Fits Together (User Journey)

1. **Provider** approves the company (after signup/payment).
2. **Customer** logs in, completes onboarding: company details → shift → employees → register device → install connector → verify sync → generate first payroll.
3. **Day to day:** Punch data flows from device → connector → cloud (or manual entry). Dashboard shows today’s attendance and trends.
4. **Month end:** Customer may enter advances; then generates payroll; can open breakdown and download reports (attendance, payroll, overtime).
5. **Ongoing:** Edits employees/shifts as needed; renews subscription to keep payroll and device sync active.

---

## 5. Value Propositions (For Messaging)

- **All-in-one:** Attendance and payroll in one system; no switching between sheets and devices.
- **Biometric-friendly:** Use existing ZKTeco (or compatible) devices; we sync to the cloud.
- **Transparent payroll:** See exactly how net salary is calculated (present days, overtime, deductions, advances, incentives).
- **Controlled access:** You decide who gets an account (approve after payment).
- **Subscription with grace:** Clear renewal and grace period so customers can renew without sudden lockout.
- **India-ready:** INR, ESI, travel allowance, and common deduction/incentive rules.
- **Exportable reports:** CSVs for attendance, payroll, and overtime for compliance and audits.
- **Guided setup:** Onboarding checklist reduces time-to-value for new customers.

---

## 6. Restrictions / Limits (Good to Know for Marketing)

- **Payroll and device sync** depend on an active subscription (and grace period).
- **Company approval** is required before login (pending signups cannot use the app until approved).
- **Connector** must run on a PC that can reach both the biometric device (network) and the internet (backend).
- **Currency and rules** are oriented to INR and common Indian payroll practices (ESI, travel allowance, etc.).

---

## 7. One-Liner and Short Blurbs

- **One-liner:** “Cloud attendance and payroll for businesses — sync from biometric devices or enter manually, generate salary and reports in one place.”
- **Short:** “Track attendance, define shifts, generate payroll, and export reports. Use your existing biometric device; we handle the rest.”
- **Audience-specific:** “For factories and offices: one system for who came, who worked when, and how much to pay — with downloadable reports for your accounts.”

---

*Document generated from product analysis for marketing and strategy use. Update as the product evolves.*
