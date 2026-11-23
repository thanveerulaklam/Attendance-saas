import { IST } from '../../utils/istDisplay';

const MAX_SESSION_MS = 24 * 60 * 60 * 1000;

const HEADERS = [
  'Employee code',
  'Name',
  'Total in hours',
  'Total out hours',
  'Punch timings',
  'Status',
];

/** Characters that fit in the punch-timings column before the next printed line. */
const PUNCH_CHARS_PER_LINE = 68;
const ROW_LINE_HEIGHT = 16;

function punchTimeMs(punch) {
  const t = new Date(punch?.punch_time || punch?.punchTime).getTime();
  return Number.isFinite(t) ? t : null;
}

function punchKind(punch) {
  return String(punch?.punch_type || punch?.punchType || 'in').toLowerCase() === 'out'
    ? 'out'
    : 'in';
}

/**
 * Time inside is each IN→OUT pair. Time outside is each gap from an OUT to the next IN.
 * An open IN is counted through `countOpenInUntil` (today only).
 */
export function computeInOutDurations(punches, { countOpenInUntil = null } = {}) {
  const sorted = (Array.isArray(punches) ? punches : [])
    .map((punch) => ({ punch, t: punchTimeMs(punch) }))
    .filter((row) => row.t != null)
    .sort((a, b) => a.t - b.t);

  let inMs = null;
  let lastOutMs = null;
  let insideMs = 0;
  let outsideMs = 0;

  for (const { punch, t } of sorted) {
    if (punchKind(punch) === 'in') {
      if (lastOutMs != null) {
        const gap = t - lastOutMs;
        if (gap > 0 && gap <= MAX_SESSION_MS) outsideMs += gap;
        lastOutMs = null;
      }
      inMs = t;
      continue;
    }

    if (inMs != null) {
      const diff = t - inMs;
      if (diff > 0 && diff <= MAX_SESSION_MS) insideMs += diff;
      inMs = null;
      lastOutMs = t;
    }
  }

  if (countOpenInUntil != null && inMs != null) {
    const end = Number(countOpenInUntil);
    const diff = end - inMs;
    if (diff > 0 && diff <= MAX_SESSION_MS) insideMs += diff;
  }

  return { insideMs, outsideMs };
}

export function formatDurationHm(ms) {
  const totalMin = Math.max(0, Math.round(Number(ms || 0) / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatClock(iso, timezone) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', {
    timeZone: timezone || IST,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatRegisterPunchTimings(punches, timezone = IST) {
  const list = (Array.isArray(punches) ? punches : [])
    .filter((punch) => punchTimeMs(punch) != null)
    .sort((a, b) => punchTimeMs(a) - punchTimeMs(b));
  if (list.length === 0) return '';
  return list
    .map((punch) => {
      const time = formatClock(punch.punch_time || punch.punchTime, timezone);
      return time ? `${time} ${punchKind(punch)}` : '';
    })
    .filter(Boolean)
    .join(', ');
}

/** Break a long punch list onto extra lines so printing does not crop it. */
export function wrapCellText(text, charsPerLine = PUNCH_CHARS_PER_LINE) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const parts = raw.split(', ');
  const lines = [];
  let current = '';
  for (const part of parts) {
    const next = current ? `${current}, ${part}` : part;
    if (current && next.length > charsPerLine) {
      lines.push(current);
      current = part;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.join('\n');
}

function rowHeightForLines(lineCount) {
  return Math.min(409, Math.max(18, lineCount * ROW_LINE_HEIGHT + 6));
}

export function getDayStatusLabel(row) {
  if (!row?.present) return 'Absent';
  if (row.full_day) return row.late ? 'Full day (late)' : 'Full day';
  if (row.half_day) return row.late ? 'Half day (late)' : 'Half day';
  if (row.open_break_name) return `On ${String(row.open_break_name).toLowerCase()}`;
  if (row.left_during_lunch) return 'On lunch';
  return row.late ? 'Present (late)' : 'Present';
}

function codeSortKey(code) {
  const text = String(code ?? '').trim();
  if (/^\d+$/.test(text)) return [0, Number(text), text];
  return [1, Number.POSITIVE_INFINITY, text.toLowerCase()];
}

export function buildDayWiseRegisterRows(employees, { timezone = IST, countOpenInUntil = null } = {}) {
  const rows = (Array.isArray(employees) ? employees : []).map((row) => {
    const durations = computeInOutDurations(row.punches, { countOpenInUntil });
    return [
      row.employee_code || '',
      row.name || '',
      formatDurationHm(durations.insideMs),
      formatDurationHm(durations.outsideMs),
      formatRegisterPunchTimings(row.punches, timezone),
      getDayStatusLabel(row),
    ];
  });

  rows.sort((a, b) => {
    const ka = codeSortKey(a[0]);
    const kb = codeSortKey(b[0]);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] !== kb[1]) return ka[1] - kb[1];
    return String(ka[2]).localeCompare(String(kb[2]));
  });
  return rows;
}

async function loadExcelJS() {
  const mod = await import('exceljs');
  return mod.default || mod;
}

function textCell(value) {
  return { value: value == null ? '' : String(value), numFmt: '@' };
}

/**
 * Download the day register as .xlsx:
 * employee code, name, total in hours, total out hours, punch timings, status.
 */
export async function downloadDayWiseReportExcel({
  filename,
  dateLabel,
  branchLabel,
  departmentLabel,
  allEmployees,
  timezone,
  countOpenInUntil = null,
}) {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PunchPay';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Attendance', {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      horizontalCentered: true,
      printTitlesRow: '1:4',
    },
    views: [{ state: 'frozen', ySplit: 4 }],
  });
  sheet.pageSetup.fitToWidth = 1;
  sheet.pageSetup.fitToHeight = 0;

  sheet.columns = [
    { width: 16 },
    { width: 28 },
    { width: 18 },
    { width: 18 },
    { width: 78 },
    { width: 18 },
  ];

  sheet.mergeCells('A1:F1');
  const title = sheet.getCell('A1');
  title.value = 'Day-wise Attendance';
  title.font = { bold: true, size: 16, color: { argb: 'FF0F172A' } };
  title.alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 24;

  const meta = [
    ['Date', dateLabel || ''],
    ['Branch', branchLabel || 'All'],
    ['Department', departmentLabel || 'All'],
  ];
  meta.forEach((pair, index) => {
    const col = index * 2 + 1;
    const labelCell = sheet.getCell(2, col);
    labelCell.value = pair[0];
    labelCell.font = { bold: true, size: 11, color: { argb: 'FF475569' } };
    const valueCell = sheet.getCell(2, col + 1);
    valueCell.value = pair[1];
    valueCell.font = { size: 11, color: { argb: 'FF0F172A' } };
  });

  const headerRow = sheet.getRow(4);
  HEADERS.forEach((label, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = label;
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' },
    };
    cell.alignment = { vertical: 'middle', horizontal: index >= 2 && index <= 3 ? 'center' : 'left' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });
  headerRow.height = 22;

  const body = buildDayWiseRegisterRows(allEmployees, { timezone, countOpenInUntil });
  body.forEach((values, rowIndex) => {
    const row = sheet.getRow(5 + rowIndex);
    values.forEach((value, colIndex) => {
      const cell = row.getCell(colIndex + 1);
      const asText = textCell(value);
      const wrapped = colIndex === 4 ? wrapCellText(asText.value) : asText.value;
      cell.value = wrapped;
      cell.numFmt = asText.numFmt;
      cell.alignment = {
        vertical: 'top',
        horizontal: colIndex === 2 || colIndex === 3 ? 'center' : 'left',
        wrapText: true,
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
    const punchLines = wrapCellText(values[4] || '').split('\n').filter(Boolean);
    const nameLines = wrapCellText(values[1] || '', 26).split('\n').filter(Boolean);
    row.height = rowHeightForLines(Math.max(punchLines.length, nameLines.length, 1));
  });

  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4 + Math.max(body.length, 1), column: HEADERS.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename || 'daily-attendance.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}
