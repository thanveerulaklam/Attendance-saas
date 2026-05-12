#!/usr/bin/env node
/**
 * Bulk-import employees from Excel (.xlsx) or CSV (.csv) into a company.
 *
 * Usage (from backend directory, with .env loaded):
 *   node ./scripts/import-employees-from-xlsx.js --file /path/to/staff.xlsx --company-name "Tharagai Readymades"
 *   node ./scripts/import-employees-from-xlsx.js --file ./data.xlsx --company-id 5 --default-shift-name "Full shift"
 *   node ./scripts/import-employees-from-xlsx.js --file ./data.xlsx --company-id 5 --upsert --default-shift-name "Full shift"
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

const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/database');
const {
  parseImportFile,
  findDuplicateEmployeeCodesInSheet,
  processEmployeeImportRows,
} = require('../src/services/employeeBulkImportService');

function parseArgs(argv) {
  const out = {
    file: null,
    companyId: null,
    companyName: null,
    sheet: null,
    dryRun: false,
    skipExisting: false,
    upsert: false,
    defaultShiftName: null,
    defaultShiftId: null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') {
      out.dryRun = true;
    } else if (a === '--skip-existing') {
      out.skipExisting = true;
    } else if (a === '--upsert') {
      out.upsert = true;
    } else if (a.startsWith('--default-shift-name=')) {
      out.defaultShiftName = a.slice('--default-shift-name='.length);
    } else if (a === '--default-shift-name' && argv[i + 1]) {
      out.defaultShiftName = argv[i + 1];
      i += 1;
    } else if (a.startsWith('--default-shift-id=')) {
      out.defaultShiftId = Number(a.slice('--default-shift-id='.length));
    } else if (a === '--default-shift-id' && argv[i + 1]) {
      out.defaultShiftId = Number(argv[i + 1]);
      i += 1;
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

/** @returns {number|null} */
async function resolveDefaultShiftId(companyId, { defaultShiftId, defaultShiftName }) {
  if (defaultShiftId != null && !Number.isNaN(Number(defaultShiftId)) && Number(defaultShiftId) > 0) {
    const r = await pool.query(
      `SELECT id, shift_name FROM shifts WHERE company_id = $1 AND id = $2`,
      [companyId, defaultShiftId]
    );
    if (r.rowCount === 0) {
      throw new Error(`No shift with id ${defaultShiftId} for company ${companyId}`);
    }
    return Number(r.rows[0].id);
  }
  if (defaultShiftName && String(defaultShiftName).trim() !== '') {
    const n = String(defaultShiftName).trim();
    let r = await pool.query(
      `SELECT id, shift_name FROM shifts
       WHERE company_id = $1 AND lower(trim(shift_name)) = lower(trim($2))`,
      [companyId, n]
    );
    if (r.rowCount === 0) {
      r = await pool.query(
        `SELECT id, shift_name FROM shifts
         WHERE company_id = $1 AND shift_name ILIKE $2
         ORDER BY id ASC`,
        [companyId, `%${n}%`]
      );
    }
    if (r.rowCount === 0) {
      throw new Error(`No shift matching "${n}" for company ${companyId}`);
    }
    if (r.rowCount > 1) {
      const names = r.rows.map((x) => x.shift_name).join(', ');
      throw new Error(`Multiple shifts match "${n}": ${names}. Use --default-shift-id instead.`);
    }
    return Number(r.rows[0].id);
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.file) {
    console.error(
      'Usage: node ./scripts/import-employees-from-xlsx.js --file <path.xlsx> --company-name "..." [--default-shift-name "Full shift"] [--default-shift-id N] [--upsert] [--dry-run] [--skip-existing] [--sheet Sheet1]'
    );
    process.exit(1);
  }

  const filePath = path.isAbsolute(args.file) ? args.file : path.resolve(process.cwd(), args.file);
  const buffer = fs.readFileSync(filePath);
  const { rows, headerMap, sheetName } = parseImportFile(buffer, {
    filename: path.basename(filePath),
    sheet: args.sheet,
  });

  const sheetDups = findDuplicateEmployeeCodesInSheet(rows, headerMap);
  if (sheetDups.length > 0) {
    console.error('Duplicate employee_code values in the same sheet (fix Excel before import):');
    console.error(JSON.stringify(sheetDups, null, 2));
    process.exit(1);
  }

  const company = await resolveCompanyId(args);
  console.log(`Company: ${company.name} (id=${company.id})`);
  console.log(`Sheet: ${sheetName}, rows: ${rows.length}, dryRun=${args.dryRun}`);

  const defaultShiftId = await resolveDefaultShiftId(company.id, {
    defaultShiftId: args.defaultShiftId,
    defaultShiftName: args.defaultShiftName,
  });
  if (
    args.defaultShiftName ||
    (args.defaultShiftId != null && !Number.isNaN(Number(args.defaultShiftId)) && Number(args.defaultShiftId) > 0)
  ) {
    console.log(`Default shift (used when shift column empty): id=${defaultShiftId}`);
  }

  const branchContext = { role: 'admin' };
  const { ok, updated, skipped, failures } = await processEmployeeImportRows(
    company.id,
    rows,
    headerMap,
    branchContext,
    {
      dryRun: args.dryRun,
      upsert: args.upsert,
      skipExisting: args.skipExisting,
      defaultShiftId,
    }
  );

  console.log('---');
  console.log(`Done. created=${ok}, updated=${updated}, skipped=${skipped}, failed=${failures.length}`);
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
