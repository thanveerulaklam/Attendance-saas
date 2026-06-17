const XLSX = require('xlsx');
const { pool } = require('../config/database');
const { createEmployee, updateEmployee } = require('./employeeService');
const {
  validateCreateEmployee,
  validateUpdateEmployee,
} = require('../validators/employeeValidator');
const { AppError } = require('../utils/AppError');

const MAX_IMPORT_ROWS = 500;

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

/** e.g. "300/- Day" → 300 with per_day hint (CSV exports). */
function parseBasicSalaryRaw(basicRaw) {
  if (basicRaw == null || basicRaw === '') {
    return { amount: null, salaryTypeHint: null };
  }
  if (typeof basicRaw === 'number' && !Number.isNaN(basicRaw)) {
    return { amount: basicRaw, salaryTypeHint: null };
  }
  const s = String(basicRaw).replace(/,/g, '').trim();
  const perDay = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*-?\s*day\b/i);
  if (perDay) {
    return { amount: Number(perDay[1]), salaryTypeHint: 'per_day' };
  }
  return { amount: parseNumberish(basicRaw), salaryTypeHint: null };
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
    const dd = Number(m[1]);
    const mm = Number(m[2]);
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
  const { amount: basicAmount, salaryTypeHint } = parseBasicSalaryRaw(basicRaw);
  const joinRaw = pickRaw(
    row,
    ['join_date', 'date_of_joining', 'doj', 'joining_date', 'date_of_join'],
    headerMap
  );

  const payload = {
    name: name != null ? String(name).trim() : '',
    employee_code: employeeCode != null ? String(employeeCode).trim() : '',
    basic_salary: basicAmount,
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

  const esiMode = pickRaw(row, ['esi_mode'], headerMap);
  if (esiMode != null && String(esiMode).trim() !== '') {
    payload.esi_mode = String(esiMode).trim().toLowerCase();
  }

  const esiPct = pickRaw(row, ['esi_percent', 'esi_percentage'], headerMap);
  if (esiPct != null && String(esiPct).trim() !== '') payload.esi_percent = parseNumberish(esiPct);

  const pfAmt = pickRaw(row, ['pf_amount', 'pf'], headerMap);
  if (pfAmt != null && String(pfAmt).trim() !== '') payload.pf_amount = parseNumberish(pfAmt);

  const pfMode = pickRaw(row, ['pf_mode'], headerMap);
  if (pfMode != null && String(pfMode).trim() !== '') {
    payload.pf_mode = String(pfMode).trim().toLowerCase();
  }

  const pfPct = pickRaw(row, ['pf_percent', 'pf_percentage'], headerMap);
  if (pfPct != null && String(pfPct).trim() !== '') payload.pf_percent = parseNumberish(pfPct);

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
  if (st != null && String(st).trim() !== '') {
    payload.salary_type = String(st).trim().toLowerCase();
  } else if (salaryTypeHint) {
    payload.salary_type = salaryTypeHint;
  }

  return payload;
}

function isEmptyRow(row) {
  const vals = Object.values(row).filter((v) => v != null && String(v).trim() !== '');
  return vals.length === 0;
}

async function loadExistingCodes(companyId) {
  const r = await pool.query(`SELECT employee_code FROM employees WHERE company_id = $1`, [companyId]);
  return new Set(r.rows.map((x) => String(x.employee_code).trim().toLowerCase()));
}

async function findEmployeeIdByCode(companyId, employeeCode) {
  const code = String(employeeCode).trim();
  const r = await pool.query(
    `SELECT id FROM employees WHERE company_id = $1 AND employee_code = $2`,
    [companyId, code]
  );
  return r.rowCount > 0 ? Number(r.rows[0].id) : null;
}

function findDuplicateEmployeeCodesInSheet(rows, headerMap) {
  const codeToFirstRow = new Map();
  const dups = [];
  for (let i = 0; i < rows.length; i += 1) {
    if (isEmptyRow(rows[i])) continue;
    const payload = rowToPayload(rows[i], headerMap);
    const code = payload.employee_code ? String(payload.employee_code).trim() : '';
    if (!code) continue;
    const rowNum = i + 2;
    if (codeToFirstRow.has(code)) {
      dups.push({
        employee_code: code,
        first_row: codeToFirstRow.get(code),
        duplicate_row: rowNum,
        duplicate_name: payload.name,
      });
    } else {
      codeToFirstRow.set(code, rowNum);
    }
  }
  return dups;
}

function applyDefaultShiftToPayload(payload, defaultShiftId) {
  if (defaultShiftId == null) return;
  const sid = payload.shift_id;
  const has =
    sid != null && sid !== '' && !Number.isNaN(Number(sid)) && Number(sid) > 0;
  if (!has) {
    payload.shift_id = defaultShiftId;
  }
}

/** Full row sync for upsert updates (same fields as typical create payload). */
function createPayloadToUpdatePayload(p) {
  const u = {
    name: p.name,
    employee_code: p.employee_code,
    basic_salary: p.basic_salary,
    join_date: p.join_date,
    status: p.status != null && p.status !== '' ? p.status : 'active',
    payroll_frequency:
      p.payroll_frequency != null && p.payroll_frequency !== '' ? p.payroll_frequency : 'monthly',
    salary_type: p.salary_type != null && p.salary_type !== '' ? p.salary_type : 'monthly',
    shift_id:
      p.shift_id != null && p.shift_id !== '' && !Number.isNaN(Number(p.shift_id))
        ? Number(p.shift_id)
        : null,
    daily_travel_allowance: p.daily_travel_allowance != null ? p.daily_travel_allowance : 0,
    esi_amount: p.esi_amount != null ? p.esi_amount : 0,
    esi_mode: p.esi_mode != null && p.esi_mode !== '' ? String(p.esi_mode).toLowerCase() : 'fixed',
    esi_percent:
      p.esi_percent != null && p.esi_percent !== '' && !Number.isNaN(Number(p.esi_percent))
        ? Number(p.esi_percent)
        : null,
    pf_amount: p.pf_amount != null ? p.pf_amount : 0,
    pf_mode: p.pf_mode != null && p.pf_mode !== '' ? String(p.pf_mode).toLowerCase() : 'fixed',
    pf_percent:
      p.pf_percent != null && p.pf_percent !== '' && !Number.isNaN(Number(p.pf_percent))
        ? Number(p.pf_percent)
        : null,
    permission_hours_override:
      p.permission_hours_override != null &&
      p.permission_hours_override !== '' &&
      !Number.isNaN(Number(p.permission_hours_override))
        ? Number(p.permission_hours_override)
        : null,
    department: p.department != null && p.department !== '' ? p.department : null,
    phone_number: p.phone_number != null && p.phone_number !== '' ? p.phone_number : null,
    aadhar_number: p.aadhar_number != null && p.aadhar_number !== '' ? p.aadhar_number : null,
    esi_number: p.esi_number != null && p.esi_number !== '' ? p.esi_number : null,
  };
  if (
    p.branch_id != null &&
    p.branch_id !== '' &&
    !Number.isNaN(Number(p.branch_id)) &&
    Number(p.branch_id) > 0
  ) {
    u.branch_id = Number(p.branch_id);
  }
  return u;
}

/**
 * @param {Buffer} buffer
 * @param {{ filename?: string, sheet?: string|null }} [opts]
 */
function parseImportFile(buffer, opts = {}) {
  const { filename = '', sheet: sheetArg = null } = opts;
  if (!buffer || buffer.length === 0) {
    throw new AppError('Empty file', 400);
  }
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  let sheetName = sheetArg;
  if (!sheetName) {
    sheetName = workbook.SheetNames[0];
  } else if (/^\d+$/.test(String(sheetName))) {
    const idx = Number(sheetName);
    sheetName = workbook.SheetNames[idx] || workbook.SheetNames[0];
  }
  if (!workbook.Sheets[sheetName]) {
    throw new AppError(
      `Sheet not found: ${sheetName}. Available: ${workbook.SheetNames.join(', ')}`,
      400
    );
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
  if (rows.length === 0) {
    throw new AppError('No data rows in file', 400);
  }
  const headerMap = buildHeaderMap(rows);
  return { rows, headerMap, sheetName };
}

function formatFailureError(err) {
  if (err instanceof AppError) {
    return err.message;
  }
  return err.message || String(err);
}

/**
 * Core import loop (CLI and API).
 * @returns {Promise<{ ok: number, updated: number, skipped: number, failures: Array<{row:number,name?:string,code?:string,error:string}> }>}
 */
async function processEmployeeImportRows(companyId, rows, headerMap, branchContext, options = {}) {
  const {
    dryRun = false,
    upsert = false,
    skipExisting = false,
    defaultShiftId = null,
  } = options;

  let existing = null;
  if (skipExisting && !dryRun && !upsert) {
    existing = await loadExistingCodes(companyId);
  }

  let ok = 0;
  let skipped = 0;
  let updated = 0;
  const failures = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNum = i + 2;
    if (isEmptyRow(row)) {
      continue;
    }

    const payload = rowToPayload(row, headerMap);
    applyDefaultShiftToPayload(payload, defaultShiftId);
    const codeKey = payload.employee_code ? String(payload.employee_code).trim().toLowerCase() : '';

    if (skipExisting && !upsert && existing && codeKey && existing.has(codeKey)) {
      skipped += 1;
      continue;
    }

    try {
      if (dryRun) {
        if (upsert) {
          const empId = await findEmployeeIdByCode(companyId, payload.employee_code);
          if (empId != null) {
            const up = createPayloadToUpdatePayload(payload);
            validateUpdateEmployee(up);
          } else {
            validateCreateEmployee(payload);
          }
        } else {
          validateCreateEmployee(payload);
        }
        ok += 1;
      } else if (upsert) {
        const empId = await findEmployeeIdByCode(companyId, payload.employee_code);
        if (empId != null) {
          const up = createPayloadToUpdatePayload(payload);
          await updateEmployee(companyId, empId, up, branchContext);
          updated += 1;
        } else {
          await createEmployee(companyId, payload, branchContext);
          ok += 1;
          if (existing) existing.add(codeKey);
        }
      } else {
        await createEmployee(companyId, payload, branchContext);
        ok += 1;
        if (existing) existing.add(codeKey);
      }
    } catch (err) {
      failures.push({
        row: rowNum,
        name: payload.name,
        code: payload.employee_code,
        error: formatFailureError(err),
      });
    }
  }

  return { ok, updated, skipped, failures };
}

/**
 * API bulk import: skip existing employee_code, no upsert, no default shift.
 * @returns {Promise<{ created: number, skipped: number, failed: typeof processEmployeeImportRows extends ... failures } | { error: string, duplicates?: any[], maxRows?: number, rowCount?: number }>}
 */
async function bulkImportEmployeesForApi(companyId, rows, headerMap, branchContext) {
  const duplicates = findDuplicateEmployeeCodesInSheet(rows, headerMap);
  if (duplicates.length > 0) {
    return { error: 'DUPLICATE_CODES_IN_SHEET', duplicates };
  }

  if (rows.length > MAX_IMPORT_ROWS) {
    return { error: 'TOO_MANY_ROWS', maxRows: MAX_IMPORT_ROWS, rowCount: rows.length };
  }

  const { ok, skipped, failures } = await processEmployeeImportRows(companyId, rows, headerMap, branchContext, {
    dryRun: false,
    upsert: false,
    skipExisting: true,
    defaultShiftId: null,
  });

  return {
    created: ok,
    skipped,
    failed: failures,
  };
}

module.exports = {
  MAX_IMPORT_ROWS,
  normalizeHeaderKey,
  buildHeaderMap,
  pickRaw,
  parseNumberish,
  parseBasicSalaryRaw,
  excelSerialToDate,
  parseJoinDate,
  rowToPayload,
  isEmptyRow,
  loadExistingCodes,
  findEmployeeIdByCode,
  findDuplicateEmployeeCodesInSheet,
  applyDefaultShiftToPayload,
  createPayloadToUpdatePayload,
  parseImportFile,
  processEmployeeImportRows,
  bulkImportEmployeesForApi,
};
