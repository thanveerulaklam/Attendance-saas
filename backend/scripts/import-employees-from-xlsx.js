#!/usr/bin/env node
/**
 * Bulk-import employees from an Excel (.xlsx) file into a company.
 *
 * Usage (from backend directory, with .env loaded):
 *   node ./scripts/import-employees-from-xlsx.js --file /path/to/staff.xlsx --company-name "Tharagai Readymades"
 *   node ./scripts/import-employees-from-xlsx.js --file ./data.xlsx --company-id 5 --dry-run
 *
 * Expected columns (first row = headers). Names are matched case-insensitively; spaces become underscores.
 * Required (one of each group):
 *   - name: name | employee_name | full_name
 *   - employee_code: employee_code | code | emp_code | staff_id
 *   - basic_salary: basic_salary | salary | basic | gross
 *   - join_date: join_date | date_of_joining | doj | joining_date
 * Optional:
 *   - department, phone_number | phone | mobile, aadhar_number | aadhaar,
 *   - esi_number, esi_amount, pf_amount,
 *   - shift_id, branch_id, status (active|inactive),
 *   - payroll_frequency (default monthly), salary_type (default monthly),
 *   - daily_travel_allowance, permission_hours_override
 *
 * Dates: Excel date cells, ISO strings, or DD/MM/YYYY (or DD-MM-YYYY).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const XLSX = require('xlsx');
const { pool } = require('../src/config/database');
const { createEmployee } = require('../src/services/employeeService');
const { validateCreateEmployee } = require('../src/validators/employeeValidator');
const { AppError } = require('../src/utils/AppError');

function parseArgs(argv) {
  const out = {
    file: null,
    companyId: null,
    companyName: null,
    sheet: null,
    dryRun: false,
    skipExisting: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') {
      out.dryRun = true;
    } else if (a === '--skip-existing') {
      out.skipExisting = true;
    } else if (a.startsWith('--file=')) {
      out.file = a.slice('--file='.length);
    } else if (a === '--file' && argv[i + 1]) {
      out.file = argv[i + 1];
      i += 1;
    } else if (a.startsWith('--company-id=')) {
      out.companyId = Number(a.slice('--company-id='.length));
    } else if (a === '--company-id' && argv[i + 1]) {
      out.companyId = Number(argv[i + 1]);
      i += 1;
    } else if (a.startsWith('--company-name=')) {
      out.companyName = a.slice('--company-name='.length);
    } else if (a === '--company-name' && argv[i + 1]) {
      out.companyName = argv[i + 1];
      i += 1;
    } else if (a.startsWith('--sheet=')) {
      out.sheet = a.slice('--sheet='.length);
    } else if (a === '--sheet' && argv[i + 1]) {
      out.sheet = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

function normalizeHeaderKey(key) {
  if (key == null) return '';
  return String(key)
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/** Map normalized header -> first seen original column key (scan first rows in case row 1 is sparse). */
function buildHeaderMap(rows, scan = 15) {
  const map = {};
  for (let i = 0; i < Math.min(rows.length, scan); i += 1) {
    const row = rows[i];
    if (!row || typeof row !== 'object') continue;
    for (const k of Object.keys(row)) {
      const nk = normalizeHeaderKey(k);
      if (nk && map[nk] == null) map[nk] = k;
    }
  }
  return map;
}

function pickRaw(row, aliases, headerMap) {
  for (const alias of aliases) {
    const key = headerMap[alias];
    if (key != null && Object.prototype.hasOwnProperty.call(row, key)) {
      const v = row[key];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        return v;
      }
    }
  }
  return undefined;
}

function parseNumberish(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  const s = String(value).replace(/,/g, '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

/** Excel 1900 serial date → JS Date (UTC midnight; join_date is date-only). */
function excelSerialToDate(serial) {
  if (typeof serial !== 'number' || Number.isNaN(serial)) return null;
  const ms = (serial - 25569) * 86400 * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseJoinDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    const d = excelSerialToDate(value);
    if (d) return d;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  const s = String(value).trim();
  if (!s) return null;
  const isoTry = new Date(s);
  if (!Number.isNaN(isoTry.getTime())) return isoTry;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let dd = Number(m[1]);
    let mm = Number(m[2]);
    let yyyy = Number(m[3]);
    if (yyyy < 100) yyyy += 2000;
    const d = new Date(yyyy, mm - 1, dd);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function rowToPayload(row, headerMap) {
  const name = pickRaw(row, ['name', 'employee_name', 'full_name', 'staff_name'], headerMap);
  const employeeCode = pickRaw(
    row,
    ['employee_code', 'code', 'emp_code', 'staff_id', 'employee_id', 'emp_id'],
    headerMap
  );
  const basicRaw = pickRaw(row, ['basic_salary', 'salary', 'basic', 'gross', 'monthly_salary'], headerMap);
  const joinRaw = pickRaw(
    row,
    ['join_date', 'date_of_joining', 'doj', 'joining_date', 'date_of_join'],
    headerMap
  );

  const payload = {
    name: name != null ? String(name).trim() : '',
    employee_code: employeeCode != null ? String(employeeCode).trim() : '',
    basic_salary: parseNumberish(basicRaw),
    join_date: parseJoinDate(joinRaw),
  };

  const dept = pickRaw(row, ['department', 'dept'], headerMap);
  if (dept != null) payload.department = String(dept).trim();

  const phone = pickRaw(row, ['phone_number', 'phone', 'mobile', 'contact'], headerMap);
  if (phone != null) payload.phone_number = String(phone).trim();

  const aadhar = pickRaw(row, ['aadhar_number', 'aadhaar', 'aadhaar_number'], headerMap);
  if (aadhar != null) payload.aadhar_number = String(aadhar).trim();

  const esiNum = pickRaw(row, ['esi_number', 'esi_no'], headerMap);
  if (esiNum != null) payload.esi_number = String(esiNum).trim();

  const esiAmt = pickRaw(row, ['esi_amount'], headerMap);
  if (esiAmt != null && String(esiAmt).trim() !== '') payload.esi_amount = parseNumberish(esiAmt);

  const pfAmt = pickRaw(row, ['pf_amount', 'pf'], headerMap);
  if (pfAmt != null && String(pfAmt).trim() !== '') payload.pf_amount = parseNumberish(pfAmt);

  const dta = pickRaw(row, ['daily_travel_allowance', 'travel_allowance', 'ta'], headerMap);
  if (dta != null && String(dta).trim() !== '') payload.daily_travel_allowance = parseNumberish(dta);

  const perm = pickRaw(row, ['permission_hours_override', 'permission_hours'], headerMap);
  if (perm != null && String(perm).trim() !== '') payload.permission_hours_override = parseNumberish(perm);

  const shiftId = pickRaw(row, ['shift_id', 'shift'], headerMap);
  if (shiftId != null && String(shiftId).trim() !== '') payload.shift_id = parseNumberish(shiftId);

  const branchId = pickRaw(row, ['branch_id', 'branch'], headerMap);
  if (branchId != null && String(branchId).trim() !== '') payload.branch_id = parseNumberish(branchId);

  const status = pickRaw(row, ['status'], headerMap);
  if (status != null && String(status).trim() !== '') payload.status = String(status).trim().toLowerCase();

  const pf = pickRaw(row, ['payroll_frequency'], headerMap);
  if (pf != null && String(pf).trim() !== '') payload.payroll_frequency = String(pf).trim().toLowerCase();

  const st = pickRaw(row, ['salary_type'], headerMap);
  if (st != null && String(st).trim() !== '') payload.salary_type = String(st).trim().toLowerCase();

  return payload;
}

function isEmptyRow(row) {
  const vals = Object.values(row).filter((v) => v != null && String(v).trim() !== '');
  return vals.length === 0;
}

async function resolveCompanyId({ companyId, companyName }) {
  if (companyId != null && !Number.isNaN(companyId) && companyId > 0) {
    const r = await pool.query(`SELECT id, name FROM companies WHERE id = $1`, [companyId]);
    if (r.rowCount === 0) {
      throw new Error(`No company with id ${companyId}`);
    }
    return { id: r.rows[0].id, name: r.rows[0].name };
  }
  if (companyName && String(companyName).trim() !== '') {
    const r = await pool.query(
      `SELECT id, name FROM companies WHERE name ILIKE $1 ORDER BY id ASC LIMIT 1`,
      [String(companyName).trim()]
    );
    if (r.rowCount === 0) {
      throw new Error(`No company matching name: ${companyName}`);
    }
    return { id: r.rows[0].id, name: r.rows[0].name };
  }
  throw new Error('Provide --company-id <n> or --company-name "Exact or partial name"');
}

async function loadExistingCodes(companyId) {
  const r = await pool.query(
    `SELECT employee_code FROM employees WHERE company_id = $1`,
    [companyId]
  );
  return new Set(r.rows.map((x) => String(x.employee_code).trim().toLowerCase()));
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.file) {
    console.error('Usage: node ./scripts/import-employees-from-xlsx.js --file <path.xlsx> --company-name "..." [--dry-run] [--skip-existing] [--sheet Sheet1]');
    process.exit(1);
  }

  const filePath = path.isAbsolute(args.file) ? args.file : path.resolve(process.cwd(), args.file);
  const workbook = XLSX.readFile(filePath, { cellDates: true, raw: false });
  let sheetName = args.sheet;
  if (!sheetName) {
    sheetName = workbook.SheetNames[0];
  } else if (/^\d+$/.test(String(sheetName))) {
    const idx = Number(sheetName);
    sheetName = workbook.SheetNames[idx] || workbook.SheetNames[0];
  }
  if (!workbook.Sheets[sheetName]) {
    console.error(`Sheet not found: ${sheetName}. Available: ${workbook.SheetNames.join(', ')}`);
    process.exit(1);
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
  if (rows.length === 0) {
    console.error('No data rows in sheet.');
    process.exit(1);
  }

  const headerMap = buildHeaderMap(rows);
  const company = await resolveCompanyId(args);
  console.log(`Company: ${company.name} (id=${company.id})`);
  console.log(`Sheet: ${sheetName}, rows: ${rows.length}, dryRun=${args.dryRun}`);

  let existing = null;
  if (args.skipExisting && !args.dryRun) {
    existing = await loadExistingCodes(company.id);
  }

  const branchContext = { role: 'admin' };
  let ok = 0;
  let skipped = 0;
  const failures = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNum = i + 2;
    if (isEmptyRow(row)) {
      continue;
    }

    const payload = rowToPayload(row, headerMap);
    const codeKey = payload.employee_code ? String(payload.employee_code).trim().toLowerCase() : '';

    if (args.skipExisting && existing && codeKey && existing.has(codeKey)) {
      skipped += 1;
      console.log(`Row ${rowNum}: SKIP (employee_code already exists: ${payload.employee_code})`);
      continue;
    }

    try {
      if (args.dryRun) {
        validateCreateEmployee(payload);
        ok += 1;
        console.log(`Row ${rowNum}: OK (dry-run) ${payload.name} / ${payload.employee_code}`);
      } else {
        const created = await createEmployee(company.id, payload, branchContext);
        ok += 1;
        if (existing) existing.add(codeKey);
        console.log(`Row ${rowNum}: CREATED id=${created.id} ${created.name} (${created.employee_code})`);
      }
    } catch (err) {
      const msg =
        err instanceof AppError
          ? `${err.message}${err.details ? ` ${JSON.stringify(err.details)}` : ''}`
          : err.message || String(err);
      failures.push({ row: rowNum, name: payload.name, code: payload.employee_code, error: msg });
      console.error(`Row ${rowNum}: FAIL ${msg}`);
    }
  }

  console.log('---');
  console.log(`Done. success=${ok}, skipped=${skipped}, failed=${failures.length}`);
  if (failures.length > 0) {
    console.error('Failures:', JSON.stringify(failures, null, 2));
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
