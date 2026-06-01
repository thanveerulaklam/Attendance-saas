import { createPdf, addReportHeader, addAutoTable, savePdf } from '../../utils/pdfGenerator';
import { formatIstTime } from '../../utils/istDisplay';

function getFirstInTime(row) {
  const firstIn = (row.punches || []).find(
    (p) => String(p.punch_type || '').toLowerCase() === 'in'
  );
  return firstIn?.punch_time ? formatIstTime(firstIn.punch_time) : '—';
}

function getDayStatusLabel(row) {
  if (!row.present) return 'Absent';
  if (row.full_day) return row.late ? 'Full day (late)' : 'Full day';
  if (row.half_day) return row.late ? 'Half day (late)' : 'Half day';
  if (row.left_during_lunch) return 'Left at lunch';
  return row.late ? 'Present (late)' : 'Present';
}

function formatPunchTimings(punches) {
  const list = Array.isArray(punches) ? punches : [];
  if (list.length === 0) return '';
  return list
    .map((p) => {
      const timeLabel = p?.punch_time ? formatIstTime(p.punch_time) : '';
      const typeLabel = String(p?.punch_type || '').toLowerCase() === 'out' ? 'OUT' : 'IN';
      return timeLabel ? `${timeLabel} (${typeLabel})` : '';
    })
    .filter(Boolean)
    .join(', ');
}

function getDayTotalHours(row) {
  if (row.total_hours_inside != null) return String(row.total_hours_inside);
  if (row.total_hours_from_shift_start != null) return String(row.total_hours_from_shift_start);
  return '';
}

function sectionTitle(doc, y, text) {
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(text, 24, y);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(0, 0, 0);
  return y + 12;
}

function tableAfterTitle(doc, head, body, startY, options = {}) {
  addAutoTable(doc, head, body, {
    startY,
    margin: { left: 24, right: 24 },
    styles: { fontSize: 8, cellPadding: 3 },
    ...options,
  });
  return doc.lastAutoTable?.finalY != null ? doc.lastAutoTable.finalY + 18 : startY + 40;
}

/**
 * Generate day-wise PDF: summary stats, absentees, late comers, all employees.
 */
export async function generateDayWiseReportPdf({
  company,
  dateLabel,
  departmentLabel,
  summary,
  absentees,
  lateComers,
  allEmployees,
  filename,
}) {
  const doc = createPdf({ orientation: 'landscape' });
  let y = addReportHeader(doc, {
    companyName: company?.name,
    companyPhone: company?.phone,
    companyAddress: company?.address,
    title: 'Day-wise Attendance Report',
    periodLabel: departmentLabel ? `${dateLabel} · ${departmentLabel}` : dateLabel,
    generatedAt: new Date().toLocaleString(),
    totalEmployees: summary.total,
  });

  y = sectionTitle(doc, y, 'Summary');
  y = tableAfterTitle(
    doc,
    [['Total', 'Present', 'Absent', 'Late', 'Full day', 'Overtime (h)']],
    [
      [
        summary.total,
        summary.present,
        summary.absent,
        summary.late,
        summary.fullDay,
        summary.overtimeHours,
      ],
    ],
    y,
    { headStyles: { fillColor: [30, 64, 175] } }
  );

  y = sectionTitle(doc, y, `Absentees (${absentees.length})`);
  y = tableAfterTitle(
    doc,
    [['Employee', 'Code', 'Branch']],
    absentees.length
      ? absentees.map((row) => [row.name || '—', row.employee_code || '—', row.branch_name || '—'])
      : [['—', '—', 'No absentees']],
    y
  );

  y = sectionTitle(doc, y, `Late comers (${lateComers.length})`);
  y = tableAfterTitle(
    doc,
    [['Employee', 'Code', 'Arrival', 'Minutes late']],
    lateComers.length
      ? lateComers.map((row) => [
          row.name || '—',
          row.employee_code || '—',
          getFirstInTime(row),
          row.minutes_late != null && row.minutes_late > 0
            ? `${Math.round(row.minutes_late)}`
            : '—',
        ])
      : [['—', '—', '—', 'No late arrivals']],
    y,
    { headStyles: { fillColor: [180, 83, 9] } }
  );

  if (y > doc.internal.pageSize.getHeight() - 120) {
    doc.addPage();
    y = 32;
  }

  y = sectionTitle(doc, y, `All employees (${allEmployees.length})`);
  tableAfterTitle(
    doc,
    [['Employee', 'Code', 'Branch', 'Status', 'Punch timings', 'Hours', 'OT (h)']],
    allEmployees.map((row) => [
      row.name || '—',
      row.employee_code || '—',
      row.branch_name || '—',
      getDayStatusLabel(row),
      formatPunchTimings(row.punches),
      getDayTotalHours(row) || '—',
      row.overtime_hours != null && row.overtime_hours > 0 ? String(row.overtime_hours) : '—',
    ]),
    y
  );

  savePdf(doc, filename || 'daily-attendance.pdf');
}

function escapeCsvCell(value) {
  const str = value == null ? '' : String(value);
  if (/[,"\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(cells) {
  return cells.map(escapeCsvCell).join(',');
}

/**
 * Build multi-section CSV matching the on-screen day-wise report.
 */
export function buildDayWiseReportCsv({
  dateLabel,
  departmentLabel,
  summary,
  absentees,
  lateComers,
  allEmployees,
}) {
  const lines = [];
  lines.push(csvRow(['Day-wise Attendance Report']));
  lines.push(csvRow(['Date', dateLabel]));
  if (departmentLabel) lines.push(csvRow(['Department', departmentLabel]));
  lines.push('');

  lines.push(csvRow(['Summary']));
  lines.push(csvRow(['Total', 'Present', 'Absent', 'Late', 'Full day', 'Overtime (h)']));
  lines.push(
    csvRow([
      summary.total,
      summary.present,
      summary.absent,
      summary.late,
      summary.fullDay,
      summary.overtimeHours,
    ])
  );
  lines.push('');

  lines.push(csvRow([`Absentees (${absentees.length})`]));
  lines.push(csvRow(['Employee', 'Code', 'Branch']));
  if (absentees.length === 0) {
    lines.push(csvRow(['No absentees', '', '']));
  } else {
    absentees.forEach((row) => {
      lines.push(csvRow([row.name || '', row.employee_code || '', row.branch_name || '']));
    });
  }
  lines.push('');

  lines.push(csvRow([`Late comers (${lateComers.length})`]));
  lines.push(csvRow(['Employee', 'Code', 'Arrival', 'Minutes late']));
  if (lateComers.length === 0) {
    lines.push(csvRow(['No late arrivals', '', '', '']));
  } else {
    lateComers.forEach((row) => {
      lines.push(
        csvRow([
          row.name || '',
          row.employee_code || '',
          getFirstInTime(row),
          row.minutes_late != null && row.minutes_late > 0
            ? Math.round(row.minutes_late)
            : '',
        ])
      );
    });
  }
  lines.push('');

  lines.push(csvRow([`All employees (${allEmployees.length})`]));
  lines.push(
    csvRow(['Employee', 'Code', 'Branch', 'Status', 'Punch timings', 'Hours', 'OT (h)'])
  );
  allEmployees.forEach((row) => {
    lines.push(
      csvRow([
        row.name || '',
        row.employee_code || '',
        row.branch_name || '',
        getDayStatusLabel(row),
        formatPunchTimings(row.punches),
        getDayTotalHours(row),
        row.overtime_hours != null && row.overtime_hours > 0 ? row.overtime_hours : '',
      ])
    );
  });

  return `${lines.join('\r\n')}\r\n`;
}

export function downloadDayWiseReportCsv(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}
