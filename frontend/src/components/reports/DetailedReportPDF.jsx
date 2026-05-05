import { createPdf, addReportHeader, addAutoTable, savePdf } from '../../utils/pdfGenerator';
import { authFetch } from '../../utils/api';
import { formatIstTime } from '../../utils/istDisplay';

function formatTotalHoursForPdf(day) {
  if (!day) return '';
  if (day.total_hours_inside != null) {
    return `${day.total_hours_inside} h`;
  }
  if (day.total_hours_from_shift_start != null) {
    return `${day.total_hours_from_shift_start} h`;
  }
  return '';
}

function formatMonthLabel(year, month) {
  if (!year || !month) return '';
  const d = new Date(year, month - 1, 1);
  return d.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function formatPunchTimings(punches) {
  const list = Array.isArray(punches) ? punches : [];
  if (list.length === 0) return '';
  return list
    .map((p) => {
      const timeLabel = p?.punch_time ? formatIstTime(p.punch_time) : '';
      const typeLabel = String(p?.punch_type || '').toLowerCase() === 'out' ? 'OUT' : 'IN';
      if (!timeLabel) return '';
      return `${timeLabel} (${typeLabel})`;
    })
    .filter(Boolean)
    .join(', ');
}

/** Day of week 0=Sun..6=Sat for a calendar YYYY-MM-DD (local date parts). */
function dayOfWeekFromYmd(ymd) {
  const parts = String(ymd || '').slice(0, 10).split('-').map(Number);
  const [y, m, d] = parts;
  if (!y || !m || !d) return 0;
  return new Date(y, m - 1, d).getDay();
}

function getWeeklyOffDaysForEmployee(employeeRow, shiftById, companyWeeklyOffDays) {
  const sid = employeeRow?.shift_id != null ? Number(employeeRow.shift_id) : null;
  if (sid && shiftById.has(sid)) {
    const arr = shiftById.get(sid).weekly_off_days;
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
    }
  }
  return Array.isArray(companyWeeklyOffDays)
    ? companyWeeklyOffDays.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    : [];
}

export async function generateDetailedAttendancePdf({
  year,
  month,
  fromDate,
  toDate,
  department,
  employeeIds,
}) {
  const selectedEmployeeIds = Array.isArray(employeeIds)
    ? employeeIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : [];
  const monthlyQuery = new URLSearchParams({
    year,
    month,
    ...(department ? { department } : {}),
  }).toString();

  const [companyRes, empRes, monthlyRes, holidaysRes, weeklyOffRes, shiftsRes] = await Promise.all([
    authFetch('/api/company', { headers: { 'Content-Type': 'application/json' } }),
    authFetch('/api/employees?limit=500', { headers: { 'Content-Type': 'application/json' } }),
    authFetch(`/api/attendance/monthly?${monthlyQuery}`, {
      headers: { 'Content-Type': 'application/json' },
    }),
    authFetch(`/api/holidays?${new URLSearchParams({ year, month }).toString()}`, {
      headers: { 'Content-Type': 'application/json' },
    }),
    authFetch('/api/holidays/weekly-off', { headers: { 'Content-Type': 'application/json' } }),
    authFetch('/api/shifts?limit=100', { headers: { 'Content-Type': 'application/json' } }),
  ]);

  const companyJson = companyRes.ok ? await companyRes.json() : { data: {} };
  const employeesJson = empRes.ok ? await empRes.json() : { data: { data: [] } };
  const monthlyJson = monthlyRes.ok ? await monthlyRes.json() : { data: null };
  const holidaysJson = holidaysRes.ok ? await holidaysRes.json() : { data: [] };
  const weeklyOffJson = weeklyOffRes.ok ? await weeklyOffRes.json() : { data: {} };
  const shiftsJson = shiftsRes.ok ? await shiftsRes.json() : { data: [] };

  const company = companyJson.data || {};
  const monthly = monthlyJson.data;
  if (!monthly || !Array.isArray(monthly.employees) || monthly.employees.length === 0) {
    throw new Error('No attendance data available for selected period');
  }

  const employeeById = new Map((employeesJson.data?.data || []).map((e) => [Number(e.id), e]));
  const selectedIdSet = new Set(selectedEmployeeIds);
  const filteredMonthlyEmployees = (monthly.employees || []).filter((emp) => {
    const empId = Number(emp.employee_id);
    if (selectedIdSet.size > 0 && !selectedIdSet.has(empId)) return false;
    if (department) {
      const fullEmp = employeeById.get(empId);
      return (fullEmp?.department || '') === department;
    }
    return true;
  });
  if (filteredMonthlyEmployees.length === 0) {
    throw new Error('No attendance data available for selected filters');
  }

  const companyWeeklyOffDays = weeklyOffJson.data?.days || [];
  const shiftList = Array.isArray(shiftsJson.data) ? shiftsJson.data : [];
  const shiftById = new Map(shiftList.map((s) => [Number(s.id), s]));

  /** Named calendar holidays (public / company). */
  const namedHolidayByDate = new Map();
  /** Explicit weekly-off rows stored as company_holidays.kind = weekly_off. */
  const explicitWeeklyOffDates = new Set();
  (holidaysJson.data || []).forEach((h) => {
    const raw = h.holiday_date ?? h.date;
    const dateStr = raw ? String(raw).slice(0, 10) : '';
    if (!dateStr) return;
    const kind = String(h.kind || 'public').toLowerCase();
    if (kind === 'weekly_off') {
      explicitWeeklyOffDates.add(dateStr);
    } else if (kind === 'public' || kind === 'company') {
      namedHolidayByDate.set(dateStr, (h.name && String(h.name).trim()) || 'Holiday');
    }
  });

  const periodLabel = fromDate && toDate
    ? `${fromDate} to ${toDate}`
    : formatMonthLabel(year, month);

  const doc = createPdf();
  const startY = addReportHeader(doc, {
    companyName: company.name,
    companyPhone: company.phone,
    companyAddress: company.address,
    title: 'Attendance Report',
    periodLabel,
    generatedAt: new Date().toLocaleString(),
    totalEmployees: filteredMonthlyEmployees.length,
  });

  const summaryBody = filteredMonthlyEmployees.map((emp) => {
    const totalDays = monthly.daysInMonth || 0;
    const present = emp.summary?.presentDays ?? 0;
    const absent = emp.summary?.absenceDays ?? 0;
    const overtime = emp.summary?.overtimeHours ?? 0;
    const halfDays = (emp.days || []).filter((d) => d.half_day).length;
    const lateCount = (emp.days || []).filter((d) => d.late).length;
    const attendancePercent = totalDays > 0 ? ((present / totalDays) * 100).toFixed(1) : '0.0';
    return [
      emp.employee_code || '',
      emp.name || '',
      String(totalDays),
      String(present),
      String(absent),
      String(halfDays),
      String(lateCount),
      String(overtime),
      `${attendancePercent}%`,
    ];
  });

  addAutoTable(
    doc,
    [['Emp Code', 'Name', 'Total Days', 'Present', 'Absent', 'Half Days', 'Late Count', 'Overtime Hours', 'Attendance %']],
    summaryBody,
    {
      startY,
      margin: { left: 32, right: 32 },
      styles: { fontSize: 8 },
    }
  );

  filteredMonthlyEmployees.forEach((emp) => {
    const pageHeight = doc.internal.pageSize.getHeight();
    const prevTableEndY = doc.lastAutoTable?.finalY || startY;
    let titleY = Math.max(prevTableEndY + 18, 32);
    // Keep heading + metadata together; create a new page only when no room.
    if (titleY > pageHeight - 60) {
      doc.addPage();
      titleY = 32;
    }
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text(`Employee: ${emp.employee_code || ''} ${emp.name || ''}`, 32, titleY);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    const shiftLabel = emp.shift_name ? `Shift: ${emp.shift_name}` : '';
    if (shiftLabel) {
      doc.text(shiftLabel, 32, titleY + 14);
    }

    const empMeta = employeeById.get(Number(emp.employee_id));
    const weeklyOffDays = getWeeklyOffDaysForEmployee(empMeta, shiftById, companyWeeklyOffDays);

    const bodyRows = [];
    (emp.days || []).forEach((day) => {
      const date = day.date;
      if (!date) return;
      if (fromDate && date < fromDate) return;
      if (toDate && date > toDate) return;

      const jsDate = new Date(date);
      const weekday = jsDate.toLocaleString('default', { weekday: 'short' });
      const dow = dayOfWeekFromYmd(date);

      const holidayName = namedHolidayByDate.get(date);
      let status = 'Absent';
      if (holidayName) {
        status = 'Holiday';
      } else if (explicitWeeklyOffDates.has(date)) {
        status = 'Weekly Off';
      } else if (weeklyOffDays.length > 0 && weeklyOffDays.includes(dow)) {
        status = 'Weekly Off';
      } else if (day.present) {
        if (day.half_day) status = 'Half Day';
        else status = 'Present';
      }

      const notes = [];
      if (holidayName) {
        notes.push(`Holiday: ${holidayName}`);
      }
      if (day.half_day) {
        notes.push('Half Day');
      }

      bodyRows.push([
        date,
        weekday,
        day.first_in_time ? formatIstTime(day.first_in_time) : '',
        day.last_out_time ? formatIstTime(day.last_out_time) : '',
        String((day.punches || []).length),
        formatPunchTimings(day.punches),
        formatTotalHoursForPdf(day),
        status,
        day.late ? 'Yes' : 'No',
        notes.join('; '),
      ]);
    });

    addAutoTable(
      doc,
      [['Date', 'Day', 'First IN', 'Last OUT', 'Punches', 'Punch Timings', 'Total Hours', 'Status', 'Late', 'Notes']],
      bodyRows,
      {
        startY: titleY + 26,
        margin: { left: 32, right: 32 },
        styles: {
          fontSize: 7,
          cellPadding: 2.5,
          overflow: 'linebreak',
          valign: 'middle',
        },
        headStyles: {
          fontSize: 7,
        },
        columnStyles: {
          0: { cellWidth: 56 },
          1: { cellWidth: 24 },
          2: { cellWidth: 44 },
          3: { cellWidth: 44 },
          4: { cellWidth: 34, halign: 'center' },
          5: { cellWidth: 136 },
          6: { cellWidth: 46, halign: 'right' },
          7: { cellWidth: 42 },
          8: { cellWidth: 26, halign: 'center' },
        },
      }
    );
  });

  const footerY = doc.internal.pageSize.getHeight() - 28;
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.text('Generated by PunchPay — punchpay.in', doc.internal.pageSize.getWidth() / 2, footerY, {
    align: 'center',
  });

  const safeCompany = (company.name || 'Company').replace(/\s+/g, '');
  const monthLabel = formatMonthLabel(year, month).replace(/\s+/g, '');
  const filename = `PunchPay_Attendance_${safeCompany}_${monthLabel || `${year}${String(month).padStart(2, '0')}`}.pdf`;
  savePdf(doc, filename);
}

