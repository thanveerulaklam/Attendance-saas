import { createPdf, addReportHeader, addAutoTable, savePdf } from './pdfGenerator';

export async function fetchAllEmployeesForExport(authFetch, queryParams = {}) {
  const limit = 500;
  let page = 1;
  let all = [];
  let total = 0;

  do {
    const params = new URLSearchParams();
    Object.entries(queryParams).forEach(([key, value]) => {
      if (value != null && String(value).trim() !== '' && value !== 'all') {
        params.set(key, String(value).trim());
      }
    });
    params.set('page', String(page));
    params.set('limit', String(limit));

    const res = await authFetch(`/api/employees?${params.toString()}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      throw new Error('Failed to load employees for export');
    }
    const json = await res.json();
    const chunk = json.data?.data || [];
    total = Number(json.data?.total || 0);
    all = all.concat(chunk);
    page += 1;
  } while (all.length < total);

  return all;
}

function devicesByBranch(devices = []) {
  const map = new Map();
  for (const device of devices) {
    if (device.branch_id == null) continue;
    const key = String(device.branch_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(device.name || `Device #${device.id}`);
  }
  return map;
}

function rowForEmployee(employee, { branchNameById, shiftNameById, deviceNamesByBranch }) {
  const branchLabel =
    employee.branch_id != null
      ? branchNameById[String(employee.branch_id)] || '—'
      : '—';
  const shiftLabel =
    employee.shift_id != null
      ? shiftNameById[String(employee.shift_id)] || `Shift #${employee.shift_id}`
      : '—';
  const deviceNames =
    employee.branch_id != null
      ? deviceNamesByBranch.get(String(employee.branch_id)) || []
      : [];
  const deviceLabel = deviceNames.length > 0 ? deviceNames.join(', ') : '—';

  return [
    employee.name || '—',
    employee.employee_code || '—',
    branchLabel,
    deviceLabel,
    shiftLabel,
  ];
}

export function downloadEmployeeListPdf({
  company,
  employees,
  branches = [],
  shifts = [],
  devices = [],
  filterLabel,
}) {
  const branchNameById = Object.fromEntries(
    (branches || []).map((b) => [String(b.id), b.name || `Branch #${b.id}`])
  );
  const shiftNameById = Object.fromEntries(
    (shifts || []).map((s) => [String(s.id), s.shift_name || `Shift #${s.id}`])
  );
  const deviceNamesByBranch = devicesByBranch(devices);

  const head = [['Name', 'Employee code', 'Branch', 'Device', 'Shift']];
  const body = (employees || []).map((emp) =>
    rowForEmployee(emp, { branchNameById, shiftNameById, deviceNamesByBranch })
  );

  const doc = createPdf({ orientation: 'landscape' });
  const startY = addReportHeader(doc, {
    companyName: company?.name,
    companyPhone: company?.phone,
    companyAddress: company?.address,
    title: 'Employee list',
    periodLabel: filterLabel || 'All employees',
    generatedAt: new Date().toLocaleString('en-IN'),
    totalEmployees: body.length,
  });

  addAutoTable(doc, head, body, {
    startY,
    margin: { left: 24, right: 24 },
    styles: { fontSize: 9, cellPadding: 5 },
    columnStyles: {
      0: { cellWidth: 140 },
      1: { cellWidth: 80 },
      2: { cellWidth: 90 },
      3: { cellWidth: 120 },
      4: { cellWidth: 90 },
    },
  });

  const slug = String(company?.name || 'PunchPay')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 40);
  const dateSlug = new Date().toISOString().slice(0, 10);
  savePdf(doc, `${slug}_Employees_${dateSlug}.pdf`);
}
