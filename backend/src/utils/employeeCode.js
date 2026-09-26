/**
 * Biometric devices often send zero-padded user IDs ("017") while PunchPay
 * stores unpadded codes ("17"). Exact string match then drops real punches.
 */

function trimCode(code) {
  return String(code == null ? '' : code).trim();
}

/** Numeric-only codes → strip leading zeros ("017" → "17", "000" → "0"). Else null. */
function numericEmployeeCodeKey(code) {
  const s = trimCode(code);
  if (!/^\d+$/.test(s)) return null;
  return s.replace(/^0+/, '') || '0';
}

/**
 * Map device-sent codes to employees. Exact match wins; otherwise a unique
 * numeric match ignoring leading zeros. Ambiguous pairs ("17" and "017" both
 * enrolled) are not auto-aliased.
 */
function buildEmployeeMapForDeviceCodes(rows, deviceCodes) {
  const byExact = Object.create(null);
  const byNumeric = Object.create(null);

  for (const row of rows || []) {
    const exact = trimCode(row.employee_code);
    const emp = { id: Number(row.id), branch_id: Number(row.branch_id) };
    if (!exact) continue;
    byExact[exact] = emp;
    const n = numericEmployeeCodeKey(exact);
    if (!n) continue;
    if (byNumeric[n] && byNumeric[n] !== 'ambiguous' && byNumeric[n].id !== emp.id) {
      byNumeric[n] = 'ambiguous';
    } else if (!byNumeric[n]) {
      byNumeric[n] = emp;
    }
  }

  const map = Object.create(null);
  for (const raw of deviceCodes || []) {
    const code = trimCode(raw);
    if (!code) continue;
    if (byExact[code]) {
      map[code] = byExact[code];
      continue;
    }
    const n = numericEmployeeCodeKey(code);
    if (n && byNumeric[n] && byNumeric[n] !== 'ambiguous') {
      map[code] = byNumeric[n];
    }
  }
  return map;
}

/**
 * Next code for a new hire. Follows an all-numeric or single-prefix pattern
 * ("17" → "18", "EMP-001" → "EMP-002"). Mixed patterns return "" so the
 * operator types a code.
 */
function suggestNextEmployeeCode(codes) {
  const trimmed = (codes || [])
    .map((code) => trimCode(code))
    .filter(Boolean);
  if (trimmed.length === 0) return '1';

  if (trimmed.every((code) => /^\d+$/.test(code))) {
    const width = Math.max(...trimmed.map((code) => code.length));
    const next = Math.max(...trimmed.map((code) => Number(code))) + 1;
    return String(next).padStart(width, '0');
  }

  const parsed = trimmed.map((code) => /^([A-Za-z]+-?)(\d+)$/.exec(code));
  if (parsed.every(Boolean)) {
    const prefix = parsed[0][1];
    const samePrefix = parsed.every(
      (match) => match[1].toLowerCase() === prefix.toLowerCase()
    );
    if (samePrefix) {
      const width = Math.max(...parsed.map((match) => match[2].length));
      const next = Math.max(...parsed.map((match) => Number(match[2]))) + 1;
      return `${prefix}${String(next).padStart(width, '0')}`;
    }
  }

  return '';
}

module.exports = {
  trimCode,
  numericEmployeeCodeKey,
  buildEmployeeMapForDeviceCodes,
  suggestNextEmployeeCode,
};
