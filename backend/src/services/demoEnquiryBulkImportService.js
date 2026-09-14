const XLSX = require('xlsx');
const { AppError } = require('../utils/AppError');
const {
  createAdminLead,
  findDemoEnquiriesByPhone,
  phoneMatchKey,
} = require('./demoEnquiryService');

const MAX_IMPORT_ROWS = 200;

function normalizeHeaderKey(key) {
  if (key == null) return '';
  return String(key)
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

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

function cellText(value) {
  if (value == null) return '';
  return String(value).trim();
}

function rowToLeadPayload(row, headerMap) {
  const fullName = cellText(
    pickRaw(row, ['full_name', 'name', 'contact', 'contact_name', 'customer'], headerMap)
  );
  const phoneNumber = cellText(
    pickRaw(row, ['phone_number', 'phone', 'mobile', 'whatsapp', 'whatsapp_number', 'contact_number'], headerMap)
  );
  const businessName = cellText(
    pickRaw(row, ['business_name', 'business', 'company', 'company_name', 'shop'], headerMap)
  );
  const city = cellText(pickRaw(row, ['city', 'town'], headerMap));
  const state = cellText(pickRaw(row, ['state'], headerMap));
  const source = cellText(pickRaw(row, ['source', 'lead_source', 'channel'], headerMap)) || 'WhatsApp';
  const email = cellText(pickRaw(row, ['email', 'email_id'], headerMap));
  const employees = cellText(
    pickRaw(row, ['employees', 'employees_range', 'employee_count', 'staff', 'staffs'], headerMap)
  );
  const notes = cellText(pickRaw(row, ['notes', 'note', 'remark', 'remarks', 'message'], headerMap));

  return {
    full_name: fullName,
    phone_number: phoneNumber,
    business_name: businessName || fullName,
    city,
    state,
    source,
    email,
    employees_range: employees,
    notes,
  };
}

function isEmptyLeadPayload(payload) {
  return !cellText(payload.full_name) && !cellText(payload.phone_number) && !cellText(payload.business_name);
}

function parseImportFile(buffer, opts = {}) {
  const { filename = '' } = opts;
  if (!buffer || buffer.length === 0) {
    throw new AppError('Empty file', 400);
  }
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  let sheetName = workbook.SheetNames.find((name) => !/^instructions$/i.test(name)) || workbook.SheetNames[0];
  if (opts.sheet) sheetName = opts.sheet;
  if (!workbook.Sheets[sheetName]) {
    throw new AppError(`Sheet not found. Available: ${workbook.SheetNames.join(', ')}`, 400);
  }
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: false });
  if (rows.length === 0) {
    throw new AppError('No data rows in file', 400);
  }
  return { rows, headerMap: buildHeaderMap(rows), sheetName, filename };
}

function stripInvisible(value) {
  return String(value || '').replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00AD]/g, '');
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function compactMobile(digits) {
  const raw = digitsOnly(digits);
  if (raw.length < 10) return '';
  if (raw.length >= 12 && raw.startsWith('91')) return raw.slice(-10);
  if (raw.length > 10) return raw.slice(-10);
  return raw;
}

function isPhoneOnlyLine(text) {
  return text.length > 0 && !/[a-zA-Z]/.test(text);
}

function parsePastedLeadLines(raw) {
  const text = stripInvisible(String(raw || '')).replace(/^\uFEFF/, '');
  const rawLines = text.split(/\r?\n/).map((line, idx) => ({
    idx: idx + 1,
    text: stripInvisible(line).trim(),
  }));

  const lines = [];
  for (let i = 0; i < rawLines.length; i += 1) {
    const cur = rawLines[i];
    if (!cur.text) continue;
    if (isPhoneOnlyLine(cur.text) && !compactMobile(cur.text)) {
      const next = rawLines[i + 1];
      if (next?.text && isPhoneOnlyLine(next.text)) {
        const combined = `${cur.text}${next.text}`;
        if (compactMobile(combined)) {
          lines.push({ idx: cur.idx, text: combined });
          i += 1;
          continue;
        }
      }
      continue;
    }
    lines.push(cur);
  }

  const rows = [];
  lines.forEach((line) => {
    const trimmed = line.text;
    if (isPhoneOnlyLine(trimmed)) {
      const phone = compactMobile(trimmed);
      if (phone) {
        rows.push({
          full_name: phone,
          phone_number: phone,
          business_name: phone,
          source: 'WhatsApp',
          _line: line.idx,
        });
        return;
      }
    }

    const match = trimmed.match(/^(.*?)[,;\t ]+(?:\+91[\s-]*)?(\d[\d\s\-()]{8,}\d)\s*$/i);
    if (match) {
      let name = match[1]
        .replace(/^[-•*\d.)\s]+/, '')
        .replace(/[-–—:,\s]+$/, '')
        .trim();
      if (/^\+?91$/i.test(name)) name = '';
      const phone = compactMobile(match[2]);
      if (phone) {
        rows.push({
          full_name: name || phone,
          phone_number: phone,
          business_name: name || phone,
          source: 'WhatsApp',
          _line: line.idx,
        });
        return;
      }
    }

    const trailingPhone = compactMobile(trimmed);
    if (trailingPhone && /[a-zA-Z]/.test(trimmed)) {
      const name = trimmed
        .replace(/(?:\+91[\s-]*)?\d[\d\s\-()]*$/, '')
        .replace(/[-–—:,\s]+$/, '')
        .trim();
      rows.push({
        full_name: name || trailingPhone,
        phone_number: trailingPhone,
        business_name: name || trailingPhone,
        source: 'WhatsApp',
        _line: line.idx,
      });
      return;
    }

    rows.push({
      _line: line.idx,
      _parseError: `Could not find a phone number on: ${trimmed.slice(0, 80)}`,
    });
  });
  return rows;
}

function existingSummary(lead) {
  if (!lead) return null;
  return {
    id: lead.id,
    full_name: lead.full_name,
    business_name: lead.business_name,
    phone_number: lead.phone_number,
    status: lead.status,
    city: lead.city,
    state: lead.state,
    source: lead.source,
  };
}

function normalizeLeadRow(row, index) {
  const rowNum = row?._line || row?._row || index + 2;
  if (row?._parseError) {
    return { _line: rowNum, _parseError: row._parseError };
  }
  const headerMap = row?._headerMap || buildHeaderMap([row || {}]);
  const looksMapped =
    row &&
    (Object.prototype.hasOwnProperty.call(row, 'phone_number') ||
      Object.prototype.hasOwnProperty.call(row, 'full_name'));
  const payload = looksMapped
    ? {
        full_name: cellText(row.full_name),
        phone_number: cellText(row.phone_number),
        business_name: cellText(row.business_name) || cellText(row.full_name),
        city: cellText(row.city),
        state: cellText(row.state),
        source: cellText(row.source) || 'WhatsApp',
        email: cellText(row.email),
        employees_range: cellText(row.employees_range || row.employees),
        notes: cellText(row.notes),
      }
    : rowToLeadPayload(row || {}, headerMap);
  return { ...payload, _line: rowNum };
}

async function bulkCreateAdminLeads(inputRows) {
  const incoming = Array.isArray(inputRows) ? inputRows : [];
  const rows = incoming
    .map((row, i) => normalizeLeadRow(row, i))
    .filter((row) => row._parseError || !isEmptyLeadPayload(row));
  if (rows.length === 0) {
    throw new AppError('No leads to import', 400);
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new AppError(`Too many rows (${rows.length}). Maximum is ${MAX_IMPORT_ROWS} per upload.`, 400);
  }

  const seenPhones = new Set();
  const details = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || {};
    const rowNum = row._line || i + 2;
    if (row._parseError) {
      failed += 1;
      details.push({ row: rowNum, status: 'failed', error: row._parseError });
      continue;
    }

    const payload = {
      full_name: cellText(row.full_name),
      phone_number: cellText(row.phone_number),
      business_name: cellText(row.business_name) || cellText(row.full_name),
      city: cellText(row.city),
      state: cellText(row.state),
      source: cellText(row.source) || 'WhatsApp',
      email: cellText(row.email),
      employees_range: cellText(row.employees_range || row.employees),
      notes: cellText(row.notes),
    };

    if (!payload.full_name) {
      failed += 1;
      details.push({ row: rowNum, phone_number: payload.phone_number, status: 'failed', error: 'Contact name is required' });
      continue;
    }
    if (!payload.phone_number) {
      failed += 1;
      details.push({ row: rowNum, full_name: payload.full_name, status: 'failed', error: 'Phone number is required' });
      continue;
    }

    const phoneKey = phoneMatchKey(payload.phone_number);
    if (!phoneKey) {
      failed += 1;
      details.push({
        row: rowNum,
        full_name: payload.full_name,
        phone_number: payload.phone_number,
        status: 'failed',
        error: 'Phone number is invalid',
      });
      continue;
    }
    if (seenPhones.has(phoneKey)) {
      skipped += 1;
      details.push({
        row: rowNum,
        full_name: payload.full_name,
        phone_number: payload.phone_number,
        status: 'skipped',
        reason: 'duplicate_in_file',
        error: 'Same mobile number appears earlier in this upload',
      });
      continue;
    }
    seenPhones.add(phoneKey);

    try {
      const existing = await findDemoEnquiriesByPhone(payload.phone_number);
      if (existing.length > 0) {
        skipped += 1;
        details.push({
          row: rowNum,
          full_name: payload.full_name,
          phone_number: payload.phone_number,
          status: 'skipped',
          reason: 'already_in_crm',
          existing: existingSummary(existing[0]),
          error: `Already on the CRM as ${[existing[0].full_name, existing[0].business_name].filter(Boolean).join(' · ')}`,
        });
        continue;
      }

      const lead = await createAdminLead(payload);
      created += 1;
      details.push({
        row: rowNum,
        full_name: lead.full_name,
        phone_number: lead.phone_number,
        status: 'created',
        id: lead.id,
      });
    } catch (err) {
      if (err && err.code === 'duplicate_phone' && err.data?.existing) {
        skipped += 1;
        details.push({
          row: rowNum,
          full_name: payload.full_name,
          phone_number: payload.phone_number,
          status: 'skipped',
          reason: 'already_in_crm',
          existing: existingSummary(err.data.existing),
          error: err.message,
        });
        continue;
      }
      failed += 1;
      details.push({
        row: rowNum,
        full_name: payload.full_name,
        phone_number: payload.phone_number,
        status: 'failed',
        error: err.message || 'Failed to add lead',
      });
    }
  }

  return { created, skipped, failed, total: rows.length, details };
}

module.exports = {
  MAX_IMPORT_ROWS,
  parseImportFile,
  parsePastedLeadLines,
  rowToLeadPayload,
  bulkCreateAdminLeads,
};
