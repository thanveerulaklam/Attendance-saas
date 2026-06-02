const { pool } = require('../config/database');
const { getDailyAttendance } = require('./attendanceService');
const { todayIstYmd } = require('../utils/istDate');
const { normalizeWhatsAppNumber } = require('../utils/whatsappPhone');
const { sendTemplateMessageWithRetry, isWhatsAppConfigured } = require('./whatsappService');

const IST = 'Asia/Kolkata';

function formatDateLongIstYmd(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(ymd || '—');
  return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00+05:30`).toLocaleDateString('en-IN', {
    timeZone: IST,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function buildSummaryFromRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const present = list.filter((r) => r.present).length;
  const late = list.filter((r) => r.late).length;
  const overtimeHours = list.reduce((sum, r) => sum + (Number(r.overtime_hours) || 0), 0);
  return {
    total: list.length,
    present,
    absent: list.length - present,
    late,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
  };
}

function formatAbsenteesList(rows) {
  const absentees = (rows || []).filter((r) => !r.present);
  if (absentees.length === 0) return 'None';
  return absentees.map((r) => r.name || 'Unknown').join(', ');
}

/**
 * Template body order: {{1}} date, {{2}} company, {{3}}–{{8}} stats + absentees.
 */
function buildTemplateBodyParameters({ companyName, dateYmd, rows }) {
  const summary = buildSummaryFromRows(rows);
  return [
    formatDateLongIstYmd(dateYmd),
    companyName || 'Company',
    String(summary.total),
    String(summary.present),
    String(summary.absent),
    String(summary.late),
    String(summary.overtimeHours),
    formatAbsenteesList(rows),
  ];
}

function resolveRecipientNumbers(company) {
  const primary =
    normalizeWhatsAppNumber(company.whatsapp_primary_number) ||
    normalizeWhatsAppNumber(company.phone);
  const secondary = normalizeWhatsAppNumber(company.whatsapp_secondary_number);
  const recipients = [];
  if (primary) recipients.push(primary);
  if (secondary && secondary !== primary) recipients.push(secondary);
  return recipients;
}

async function fetchDailyRows(companyId, dateYmd) {
  return getDailyAttendance(companyId, dateYmd, null, null, null);
}

/**
 * Send today's attendance report for one company to configured recipients.
 * @param {object} company - row with id, name, phone, whatsapp_* fields
 * @param {{ dateYmd?: string }} options
 */
async function sendDailyAttendanceForCompany(company, options = {}) {
  if (!isWhatsAppConfigured()) {
    throw new Error('WhatsApp API is not configured on the server');
  }

  const dateYmd = options.dateYmd || todayIstYmd();
  const companyId = company.id;

  if (company.whatsapp_last_sent_for_date) {
    const last = String(company.whatsapp_last_sent_for_date).slice(0, 10);
    if (last === dateYmd) {
      return { skipped: true, reason: 'already_sent_today', dateYmd };
    }
  }

  const recipients = resolveRecipientNumbers(company);
  if (recipients.length === 0) {
    throw new Error('No WhatsApp recipient number configured for this company');
  }

  const rows = await fetchDailyRows(companyId, dateYmd);
  const bodyParams = buildTemplateBodyParameters({
    companyName: company.name,
    dateYmd,
    rows,
  });

  const results = [];
  let primaryOk = false;

  for (let i = 0; i < recipients.length; i += 1) {
    const to = recipients[i];
    try {
      const res = await sendTemplateMessageWithRetry(to, bodyParams, 1);
      results.push({ to, ok: true, messageId: res?.messages?.[0]?.id });
      if (i === 0) primaryOk = true;
    } catch (err) {
      results.push({ to, ok: false, error: err.message });
      console.error(
        `[whatsapp] company=${companyId} to=${to} failed:`,
        err.message
      );
    }
  }

  if (!primaryOk) {
    const firstErr = results.find((r) => !r.ok)?.error || 'Primary send failed';
    throw new Error(firstErr);
  }

  await pool.query(
    `UPDATE companies
     SET whatsapp_last_sent_for_date = $2::date,
         whatsapp_last_sent_at = NOW()
     WHERE id = $1`,
    [companyId, dateYmd]
  );

  return { skipped: false, dateYmd, recipients: results, employeeCount: rows.length };
}

module.exports = {
  buildSummaryFromRows,
  buildTemplateBodyParameters,
  formatDateLongIstYmd,
  sendDailyAttendanceForCompany,
  resolveRecipientNumbers,
};
