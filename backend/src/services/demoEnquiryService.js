const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');

const DEMO_ENQUIRY_STATUSES = [
  'not_contacted',
  'contacted',
  'demo_booked',
  'demo_given',
  'sold',
  'lost',
  'converted',
];

/** Built-in suggestions (stored value → same or mapped label). */
const DEFAULT_LEAD_SOURCE_SUGGESTIONS = [
  'Referral',
  'Cold call',
  'WhatsApp',
  'Email',
  'Event / expo',
  'Google search',
  'Instagram',
  'Facebook',
  'Walk-in',
  'Existing customer',
  'Partner',
  'Other',
];

const DEFAULT_STATE_SUGGESTIONS = [
  'Tamil Nadu',
  'Kerala',
  'Karnataka',
  'Andhra Pradesh',
  'Telangana',
  'Maharashtra',
  'Gujarat',
  'Rajasthan',
  'Madhya Pradesh',
  'Uttar Pradesh',
  'Delhi',
  'West Bengal',
  'Odisha',
  'Bihar',
  'Jharkhand',
  'Chhattisgarh',
  'Punjab',
  'Haryana',
  'Himachal Pradesh',
  'Uttarakhand',
  'Assam',
  'Goa',
  'Puducherry',
  'Jammu and Kashmir',
  'Ladakh',
];

const DEFAULT_CITY_SUGGESTIONS = [
  'Coimbatore',
  'Chennai',
  'Madurai',
  'Tiruppur',
  'Salem',
  'Erode',
  'Tiruchirappalli',
  'Tirunelveli',
  'Vellore',
  'Thoothukudi',
  'Dindigul',
  'Thanjavur',
  'Karur',
  'Namakkal',
  'Hosur',
  'Nagercoil',
  'Kanchipuram',
  'Bengaluru',
  'Hyderabad',
  'Mumbai',
  'Pune',
  'Kochi',
];

const LOCATION_MAX_LEN = 80;

function normalizeLeadSource(raw) {
  const text = normText(raw);
  if (!text) return 'Manual entry';
  return text.length > 120 ? text.slice(0, 120) : text;
}

const CALL_OUTCOMES = [
  'pending',
  'no_answer',
  'busy',
  'voicemail',
  'callback',
  'connected',
  'interested',
  'demo_booked',
  'demo_given',
  'sold',
  'not_interested',
  'lost',
  'wrong_number',
];

const CALL_OUTCOMES_REQUIRE_FOLLOW_UP = ['callback', 'demo_booked'];

const ENQUIRY_LIST_COLUMNS = `de.id, de.full_name, de.business_name, de.phone_number, de.email,
  de.city, de.state, de.employees_range, de.source, de.expected_plan, de.notes,
  de.status, de.status_updated_at, de.created_at, de.demo_scheduled_at,
  de.last_contacted_at, de.next_follow_up_at, de.converted_company_id, de.converted_at,
  c.name AS converted_company_name,
  last_call.id AS last_call_id,
  last_call.outcome AS last_call_outcome,
  last_call.notes AS last_call_notes,
  last_call.called_at AS last_call_at,
  last_call.follow_up_at AS last_call_follow_up_at,
  last_call.reason AS last_call_reason`;

function normText(v) {
  if (v == null) return '';
  return String(v).trim();
}

function titleCaseLocation(raw) {
  const text = normText(raw);
  if (!text) return '';
  return text
    .split(/\s+/)
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(' ');
}

function clipLocation(raw) {
  const text = normText(raw);
  if (!text) return '';
  return text.length > LOCATION_MAX_LEN ? text.slice(0, LOCATION_MAX_LEN) : text;
}

function phoneDigits(raw) {
  return String(raw || '').replace(/\D/g, '');
}

function phoneMatchKey(raw) {
  const digits = phoneDigits(raw);
  if (!digits) return '';
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

async function findDemoEnquiriesByPhone(phoneRaw) {
  const key = phoneMatchKey(phoneRaw);
  if (!key) return [];

  const result = await pool.query(
    `SELECT ${ENQUIRY_LIST_COLUMNS}
     ${enquirySelectFrom()}
     WHERE regexp_replace(COALESCE(de.phone_number, ''), '[^0-9]', '', 'g') <> ''
       AND RIGHT(regexp_replace(de.phone_number, '[^0-9]', '', 'g'), $2) = $1
     ORDER BY de.created_at DESC
     LIMIT 5`,
    [key, key.length]
  );
  return result.rows;
}

function duplicatePhoneError(matches) {
  const existing = matches[0];
  const extra = matches.length - 1;
  const who = [existing.full_name, existing.business_name].filter(Boolean).join(' · ');
  const extraNote = extra > 0 ? ` (${extra} more with this number)` : '';
  const err = new AppError(
    `This mobile number is already on the CRM as ${who || `lead #${existing.id}`}${extraNote}.`,
    409,
    'duplicate_phone'
  );
  err.data = {
    existing,
    match_count: matches.length,
  };
  return err;
}

async function canonicalizeLocation(raw, column) {
  const text = clipLocation(raw);
  if (!text) return '';
  const col = column === 'state' ? 'state' : 'city';
  const defaults = col === 'state' ? DEFAULT_STATE_SUGGESTIONS : DEFAULT_CITY_SUGGESTIONS;

  const result = await pool.query(
    `SELECT TRIM(${col}) AS label
     FROM demo_enquiries
     WHERE ${col} IS NOT NULL AND TRIM(${col}) <> ''
       AND LOWER(TRIM(${col})) = LOWER($1)
     ORDER BY id ASC
     LIMIT 1`,
    [text]
  );
  if (result.rows[0]?.label) return clipLocation(result.rows[0].label);

  const preset = defaults.find((label) => label.toLowerCase() === text.toLowerCase());
  if (preset) return preset;

  return titleCaseLocation(text);
}

function enquirySelectFrom() {
  return `FROM demo_enquiries de
          LEFT JOIN companies c ON c.id = de.converted_company_id
          LEFT JOIN LATERAL (
            SELECT id, outcome, notes, called_at, follow_up_at, reason, extra_phone
            FROM demo_enquiry_calls
            WHERE enquiry_id = de.id
            ORDER BY called_at DESC, id DESC
            LIMIT 1
          ) last_call ON TRUE`;
}

const DATE_YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseYmdStartIst(raw, label) {
  const text = String(raw || '').trim();
  if (!text) return null;
  if (!DATE_YMD.test(text)) {
    throw new AppError(`${label} must be YYYY-MM-DD`, 400);
  }
  const start = new Date(`${text}T00:00:00+05:30`);
  if (Number.isNaN(start.getTime())) {
    throw new AppError(`${label} is invalid`, 400);
  }
  return start;
}

function createdAtRange({ from, to } = {}) {
  const start = parseYmdStartIst(from, 'from');
  const endDay = parseYmdStartIst(to, 'to');
  if (!start && !endDay) return null;
  if (start && endDay && endDay < start) {
    throw new AppError('from must be on or before to', 400);
  }
  return {
    start,
    endExclusive: endDay ? new Date(endDay.getTime() + 24 * 60 * 60 * 1000) : null,
  };
}

function pushCreatedAtRange(conditions, params, paramIndex, range) {
  let index = paramIndex;
  if (!range) return index;
  if (range.start) {
    conditions.push(`de.created_at >= $${index}`);
    params.push(range.start.toISOString());
    index += 1;
  }
  if (range.endExclusive) {
    conditions.push(`de.created_at < $${index}`);
    params.push(range.endExclusive.toISOString());
    index += 1;
  }
  return index;
}

async function createDemoEnquiry(companyIdIgnored, data) {
  const fullName = normText(data.full_name);
  const businessName = normText(data.business_name);
  const phoneNumber = normText(data.phone_number);
  const employeesRange = normText(data.employees_range);
  const notes = data.notes ? normText(data.notes) : null;
  const city = await canonicalizeLocation(data.city, 'city');
  const state = await canonicalizeLocation(data.state, 'state');

  if (!fullName) throw new AppError('Full name is required', 400);
  if (!businessName) throw new AppError('Business name is required', 400);
  if (!phoneNumber) throw new AppError('Phone number is required', 400);
  if (!employeesRange) throw new AppError('Number of employees is required', 400);
  if (!city) throw new AppError('City is required', 400);
  if (!state) throw new AppError('State is required', 400);

  const result = await pool.query(
    `INSERT INTO demo_enquiries (
       full_name, business_name, phone_number, employees_range,
       source, notes, city, state
     )
     VALUES ($1, $2, $3, $4, 'landing', $5, $6, $7)
     RETURNING *`,
    [fullName, businessName, phoneNumber, employeesRange, notes, city, state]
  );

  return result.rows[0];
}

async function createAdminLead(data) {
  const fullName = normText(data.full_name);
  const businessName = normText(data.business_name);
  const phoneNumber = normText(data.phone_number);
  const email = normText(data.email) || null;
  const employeesRange = normText(data.employees_range) || 'Not specified';
  const notes = data.notes ? normText(data.notes) : null;
  const city = (await canonicalizeLocation(data.city, 'city')) || null;
  const state = (await canonicalizeLocation(data.state, 'state')) || null;
  const source = normalizeLeadSource(data.source);
  if (!normText(data.source)) {
    throw new AppError('Lead source is required (where did this lead come from?)', 400);
  }
  const expectedPlan =
    typeof data.expected_plan === 'string' && data.expected_plan.trim()
      ? data.expected_plan.trim().toLowerCase().slice(0, 32)
      : null;
  const statusRaw = normText(data.status).toLowerCase() || 'not_contacted';
  const status = DEMO_ENQUIRY_STATUSES.includes(statusRaw) && statusRaw !== 'converted'
    ? statusRaw
    : 'not_contacted';

  if (!fullName) throw new AppError('Contact name is required', 400);
  if (!businessName) throw new AppError('Business name is required', 400);
  if (!phoneNumber) throw new AppError('Phone number is required', 400);

  const existingByPhone = await findDemoEnquiriesByPhone(phoneNumber);
  if (existingByPhone.length > 0) {
    throw duplicatePhoneError(existingByPhone);
  }

  const result = await pool.query(
    `INSERT INTO demo_enquiries (
       full_name, business_name, phone_number, email, employees_range,
       source, expected_plan, notes, status, status_updated_at, city, state
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11)
     RETURNING *`,
    [fullName, businessName, phoneNumber, email, employeesRange, source, expectedPlan, notes, status, city, state]
  );

  return getDemoEnquiryById(result.rows[0].id);
}

async function getDemoEnquiryById(enquiryId) {
  const id = Number(enquiryId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('enquiry_id (number) is required', 400);
  }

  const result = await pool.query(
    `SELECT ${ENQUIRY_LIST_COLUMNS}
     ${enquirySelectFrom()}
     WHERE de.id = $1`,
    [id]
  );

  if (result.rowCount === 0) {
    throw new AppError('Enquiry not found', 404);
  }

  return result.rows[0];
}

async function listDemoEnquiries(
  _companyIdIgnored,
  {
    page = 1,
    limit = 20,
    status = null,
    q = null,
    pipeline = null,
    from = null,
    to = null,
    call_outcome = null,
  } = {}
) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  const params = [];
  let paramIndex = 1;

  const normalizedStatus =
    typeof status === 'string' && status.trim() && status.trim() !== 'all'
      ? status.trim().toLowerCase()
      : null;
  if (normalizedStatus) {
    if (!DEMO_ENQUIRY_STATUSES.includes(normalizedStatus)) {
      throw new AppError(`status must be one of: ${DEMO_ENQUIRY_STATUSES.join(', ')}`, 400);
    }
    conditions.push(`de.status = $${paramIndex}`);
    params.push(normalizedStatus);
    paramIndex += 1;
  }

  if (pipeline === 'open') {
    conditions.push(`de.status NOT IN ('lost', 'converted')`);
  } else if (pipeline === 'in_progress') {
    conditions.push(`de.status IN ('contacted', 'demo_booked', 'demo_given')`);
  }

  const normalizedCallOutcome =
    typeof call_outcome === 'string' && call_outcome.trim()
      ? call_outcome.trim().toLowerCase()
      : null;
  if (normalizedCallOutcome) {
    if (!CALL_OUTCOMES.includes(normalizedCallOutcome)) {
      throw new AppError(`call_outcome must be one of: ${CALL_OUTCOMES.join(', ')}`, 400);
    }
    if (normalizedCallOutcome === 'pending') {
      conditions.push(`(last_call.outcome IS NULL OR last_call.outcome = 'pending')`);
    } else {
      conditions.push(`last_call.outcome = $${paramIndex}`);
      params.push(normalizedCallOutcome);
      paramIndex += 1;
    }
  }

  const search = typeof q === 'string' ? q.trim() : '';
  if (search) {
    conditions.push(
      `(de.full_name ILIKE $${paramIndex}
        OR de.business_name ILIKE $${paramIndex}
        OR de.phone_number ILIKE $${paramIndex}
        OR COALESCE(de.email, '') ILIKE $${paramIndex}
        OR COALESCE(de.city, '') ILIKE $${paramIndex}
        OR COALESCE(de.state, '') ILIKE $${paramIndex}
        OR COALESCE(de.notes, '') ILIKE $${paramIndex})`
    );
    params.push(`%${search}%`);
    paramIndex += 1;
  }

  paramIndex = pushCreatedAtRange(conditions, params, paramIndex, createdAtRange({ from, to }));

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total ${enquirySelectFrom()} ${whereClause}`,
    params
  );
  const total = Number(countResult.rows[0]?.total || 0);

  const listParams = [...params, limitNum, offset];
  const result = await pool.query(
    `SELECT ${ENQUIRY_LIST_COLUMNS}
     ${enquirySelectFrom()}
     ${whereClause}
     ORDER BY de.created_at DESC, de.id DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    listParams
  );

  return {
    data: result.rows,
    page: pageNum,
    limit: limitNum,
    total,
  };
}

function mergeSuggestionLabels(defaults, rows, field) {
  const seen = new Set();
  const labels = [];

  for (const row of rows) {
    const label = normText(row[field]);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }

  for (const label of defaults) {
    const key = String(label).trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }

  return labels;
}

async function getDemoEnquirySuggestions() {
  const [sourceResult, cityResult, stateResult] = await Promise.all([
    pool.query(
      `SELECT TRIM(source) AS source, COUNT(*)::int AS use_count
       FROM demo_enquiries
       WHERE source IS NOT NULL AND TRIM(source) <> ''
       GROUP BY TRIM(source)
       ORDER BY use_count DESC, source ASC
       LIMIT 40`
    ),
    pool.query(
      `SELECT TRIM(city) AS city, COUNT(*)::int AS use_count
       FROM demo_enquiries
       WHERE city IS NOT NULL AND TRIM(city) <> ''
       GROUP BY TRIM(city)
       ORDER BY use_count DESC, city ASC
       LIMIT 80`
    ),
    pool.query(
      `SELECT TRIM(state) AS state, COUNT(*)::int AS use_count
       FROM demo_enquiries
       WHERE state IS NOT NULL AND TRIM(state) <> ''
       GROUP BY TRIM(state)
       ORDER BY use_count DESC, state ASC
       LIMIT 40`
    ),
  ]);

  return {
    sources: mergeSuggestionLabels(DEFAULT_LEAD_SOURCE_SUGGESTIONS, sourceResult.rows, 'source'),
    cities: mergeSuggestionLabels(DEFAULT_CITY_SUGGESTIONS, cityResult.rows, 'city'),
    states: mergeSuggestionLabels(DEFAULT_STATE_SUGGESTIONS, stateResult.rows, 'state'),
  };
}

async function getDemoEnquiryStats({ from = null, to = null } = {}) {
  const conditions = [];
  const params = [];
  pushCreatedAtRange(conditions, params, 1, createdAtRange({ from, to }));
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [statusResult, outcomeResult] = await Promise.all([
    pool.query(
      `SELECT status, COUNT(*)::int AS count
       FROM demo_enquiries de
       ${whereClause}
       GROUP BY status`,
      params
    ),
    pool.query(
      `SELECT COALESCE(last_call.outcome, 'pending') AS outcome, COUNT(*)::int AS count
       ${enquirySelectFrom()}
       ${whereClause}
       GROUP BY COALESCE(last_call.outcome, 'pending')`,
      params
    ),
  ]);

  const byStatus = {};
  for (const status of DEMO_ENQUIRY_STATUSES) {
    byStatus[status] = 0;
  }
  let total = 0;
  for (const row of statusResult.rows) {
    byStatus[row.status] = Number(row.count || 0);
    total += Number(row.count || 0);
  }

  const byCallOutcome = {};
  for (const outcome of CALL_OUTCOMES) {
    byCallOutcome[outcome] = 0;
  }
  for (const row of outcomeResult.rows) {
    const key = CALL_OUTCOMES.includes(row.outcome) ? row.outcome : 'pending';
    byCallOutcome[key] = (byCallOutcome[key] || 0) + Number(row.count || 0);
  }

  const open =
    byStatus.not_contacted +
    byStatus.contacted +
    byStatus.demo_booked +
    byStatus.demo_given +
    byStatus.sold;

  return {
    total,
    open,
    by_status: byStatus,
    by_call_outcome: byCallOutcome,
    in_progress: byStatus.contacted + byStatus.demo_booked + byStatus.demo_given,
    hot: byStatus.sold,
    converted: byStatus.converted,
    lost: byStatus.lost,
    demo_booked: byStatus.demo_booked,
  };
}

async function updateDemoEnquiryStatus(enquiryId, status) {
  const enquiry = await getDemoEnquiryById(enquiryId);
  if (enquiry.converted_company_id) {
    throw new AppError('Converted leads cannot change status', 400);
  }

  const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : '';
  if (!DEMO_ENQUIRY_STATUSES.includes(normalizedStatus) || normalizedStatus === 'converted') {
    throw new AppError(`status must be one of: ${DEMO_ENQUIRY_STATUSES.filter((s) => s !== 'converted').join(', ')}`, 400);
  }
  if (normalizedStatus === 'demo_booked') {
    throw new AppError('Pick a demo date and time to mark as Demo booked', 400);
  }

  const result = await pool.query(
    `UPDATE demo_enquiries
     SET status = $2,
         next_follow_up_at = CASE WHEN $2 = 'lost' THEN NULL ELSE next_follow_up_at END,
         status_updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [enquiry.id, normalizedStatus]
  );

  if (result.rowCount === 0) {
    throw new AppError('Enquiry not found', 404);
  }

  return getDemoEnquiryById(enquiry.id);
}

function parseDemoScheduledAt(raw) {
  if (raw == null || raw === '') return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new AppError('Demo date and time is invalid', 400);
  }
  return d;
}

async function bookDemoEnquiry(enquiryId, scheduledAtRaw) {
  const enquiry = await getDemoEnquiryById(enquiryId);
  if (enquiry.converted_company_id || enquiry.status === 'converted') {
    throw new AppError('Converted leads cannot be booked for a demo', 400);
  }
  if (enquiry.status === 'lost') {
    throw new AppError('Cannot book a demo for a lost lead. Change status first.', 400);
  }
  const scheduledAt = parseDemoScheduledAt(scheduledAtRaw);
  if (!scheduledAt) {
    throw new AppError('Demo date and time is required', 400);
  }

  const result = await pool.query(
    `UPDATE demo_enquiries
     SET status = 'demo_booked',
         demo_scheduled_at = $2,
         next_follow_up_at = $2,
         status_updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [enquiry.id, scheduledAt.toISOString()]
  );

  if (result.rowCount === 0) {
    throw new AppError('Enquiry not found', 404);
  }

  return getDemoEnquiryById(enquiry.id);
}

async function listScheduledDemos() {
  const result = await pool.query(
    `SELECT ${ENQUIRY_LIST_COLUMNS}
     ${enquirySelectFrom()}
     WHERE de.status NOT IN ('converted', 'lost')
       AND (last_call.outcome IS NULL OR last_call.outcome NOT IN ('lost', 'not_interested'))
       AND (
         (de.status = 'demo_booked' AND de.demo_scheduled_at IS NOT NULL)
         OR de.next_follow_up_at IS NOT NULL
       )
     ORDER BY COALESCE(de.next_follow_up_at, de.demo_scheduled_at) ASC
     LIMIT 40`
  );
  return result.rows;
}

async function updateDemoEnquiryNotes(enquiryId, notes) {
  const id = Number(enquiryId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('enquiry_id (number) is required', 400);
  }

  const normalizedNotes = notes == null || notes === '' ? null : normText(notes);

  const result = await pool.query(
    `UPDATE demo_enquiries
     SET notes = $2
     WHERE id = $1
     RETURNING id`,
    [id, normalizedNotes]
  );

  if (result.rowCount === 0) {
    throw new AppError('Enquiry not found', 404);
  }

  return getDemoEnquiryById(id);
}

async function updateDemoEnquiryDetails(enquiryId, data) {
  const enquiry = await getDemoEnquiryById(enquiryId);

  const fullName = normText(data.full_name);
  const businessName = normText(data.business_name);
  const phoneNumber = normText(data.phone_number);
  const email = normText(data.email) || null;
  const employeesRange = normText(data.employees_range) || enquiry.employees_range || 'Not specified';
  const notes = data.notes == null || data.notes === '' ? null : normText(data.notes);
  const city = (await canonicalizeLocation(data.city, 'city')) || null;
  const state = (await canonicalizeLocation(data.state, 'state')) || null;
  const source = normalizeLeadSource(data.source);
  if (!normText(data.source)) {
    throw new AppError('Lead source is required (where did this lead come from?)', 400);
  }
  const expectedPlan =
    typeof data.expected_plan === 'string' && data.expected_plan.trim()
      ? data.expected_plan.trim().toLowerCase().slice(0, 32)
      : null;

  if (!fullName) throw new AppError('Contact name is required', 400);
  if (!businessName) throw new AppError('Business name is required', 400);
  if (!phoneNumber) throw new AppError('Phone number is required', 400);

  const isConverted = Boolean(enquiry.converted_company_id) || enquiry.status === 'converted';
  let status = enquiry.status;
  if (data.status != null && String(data.status).trim() !== '') {
    const statusRaw = normText(data.status).toLowerCase();
    if (isConverted) {
      if (statusRaw !== 'converted') {
        throw new AppError('Converted leads cannot change status', 400);
      }
    } else if (!DEMO_ENQUIRY_STATUSES.includes(statusRaw) || statusRaw === 'converted') {
      throw new AppError(
        `status must be one of: ${DEMO_ENQUIRY_STATUSES.filter((s) => s !== 'converted').join(', ')}`,
        400
      );
    } else {
      status = statusRaw;
    }
  }

  if (status === 'demo_booked' && !enquiry.demo_scheduled_at && !data.demo_scheduled_at) {
    throw new AppError('Pick a demo date and time before saving as Demo booked', 400);
  }

  let demoScheduledAt = enquiry.demo_scheduled_at || null;
  if (Object.prototype.hasOwnProperty.call(data, 'demo_scheduled_at')) {
    demoScheduledAt = parseDemoScheduledAt(data.demo_scheduled_at);
  } else if (status !== 'demo_booked' && status !== enquiry.status) {
    demoScheduledAt = enquiry.demo_scheduled_at || null;
  }

  const statusChanged = status !== enquiry.status;
  const result = await pool.query(
    `UPDATE demo_enquiries
     SET full_name = $2,
         business_name = $3,
         phone_number = $4,
         email = $5,
         employees_range = $6,
         source = $7,
         expected_plan = $8,
         notes = $9,
         city = $10,
         state = $11,
         status = $12,
         status_updated_at = $13,
         demo_scheduled_at = $14
     WHERE id = $1
     RETURNING id`,
    [
      enquiry.id,
      fullName,
      businessName,
      phoneNumber,
      email,
      employeesRange,
      source,
      expectedPlan,
      notes,
      city,
      state,
      status,
      statusChanged ? new Date() : enquiry.status_updated_at,
      demoScheduledAt,
    ]
  );

  if (result.rowCount === 0) {
    throw new AppError('Enquiry not found', 404);
  }

  return getDemoEnquiryById(enquiry.id);
}

function normalizeCallOutcome(raw, { allowPending = true } = {}) {
  const outcome = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!CALL_OUTCOMES.includes(outcome)) {
    throw new AppError(
      `outcome must be one of: ${CALL_OUTCOMES.filter((o) => o !== 'pending').join(', ')}`,
      400
    );
  }
  if (outcome === 'pending' && !allowPending) {
    throw new AppError('Pick a call outcome', 400);
  }
  return outcome;
}

async function listEnquiryCalls(enquiryId) {
  const enquiry = await getDemoEnquiryById(enquiryId);
  const result = await pool.query(
    `SELECT id, enquiry_id, outcome, notes, follow_up_at, reason, extra_phone, called_at, updated_at
     FROM demo_enquiry_calls
     WHERE enquiry_id = $1
     ORDER BY called_at DESC, id DESC
     LIMIT 50`,
    [enquiry.id]
  );
  return result.rows;
}

function parseFollowUpAt(raw, label = 'Follow-up date and time') {
  if (raw == null || raw === '') return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new AppError(`${label} is invalid`, 400);
  }
  return d;
}

function pipelineStatusForOutcome(outcome, currentStatus) {
  if (currentStatus === 'converted') return currentStatus;
  if (outcome === 'lost' || outcome === 'not_interested') return 'lost';
  if (outcome === 'sold') return 'sold';
  if (outcome === 'demo_given') return currentStatus === 'sold' ? 'sold' : 'demo_given';
  if (outcome === 'demo_booked') return 'demo_booked';
  if (currentStatus === 'lost' && ['callback', 'connected', 'interested', 'demo_booked'].includes(outcome)) {
    return outcome === 'demo_booked' ? 'demo_booked' : 'contacted';
  }
  if (currentStatus === 'not_contacted') return 'contacted';
  return currentStatus;
}

async function applyCallOutcomeToEnquiry(enquiryId, { outcome, followUpAt, calledAt }) {
  const enquiry = await getDemoEnquiryById(enquiryId);
  if (enquiry.converted_company_id || enquiry.status === 'converted') {
    await pool.query(`UPDATE demo_enquiries SET last_contacted_at = COALESCE($2, last_contacted_at) WHERE id = $1`, [
      enquiry.id,
      calledAt || null,
    ]);
    return getDemoEnquiryById(enquiry.id);
  }

  if (outcome === 'demo_booked') {
    if (!followUpAt) throw new AppError('Pick a demo date and time', 400);
    await pool.query(
      `UPDATE demo_enquiries
       SET status = 'demo_booked',
           demo_scheduled_at = $2,
           next_follow_up_at = $2,
           last_contacted_at = COALESCE($3, last_contacted_at, NOW()),
           status_updated_at = $4
       WHERE id = $1`,
      [
        enquiry.id,
        followUpAt.toISOString(),
        calledAt || null,
        enquiry.status === 'demo_booked' ? enquiry.status_updated_at : new Date(),
      ]
    );
    return getDemoEnquiryById(enquiry.id);
  }

  const nextStatus = pipelineStatusForOutcome(outcome, enquiry.status);
  const nextFollowUp = followUpAt || null;
  const clearFollowUp = outcome === 'lost' || outcome === 'not_interested' || outcome === 'sold';
  const statusChanged = nextStatus !== enquiry.status;

  await pool.query(
    `UPDATE demo_enquiries
     SET status = $2,
         next_follow_up_at = $3,
         last_contacted_at = COALESCE($4, last_contacted_at, NOW()),
         status_updated_at = $5
     WHERE id = $1`,
    [
      enquiry.id,
      nextStatus,
      clearFollowUp ? null : nextFollowUp ? nextFollowUp.toISOString() : enquiry.next_follow_up_at,
      calledAt || null,
      statusChanged ? new Date() : enquiry.status_updated_at,
    ]
  );
  return getDemoEnquiryById(enquiry.id);
}

function readCallFeedback(data, { requireFollowUp }) {
  const notes = data.notes == null || data.notes === '' ? null : normText(data.notes);
  const reason = data.reason == null || data.reason === '' ? null : normText(data.reason);
  const extraPhone = data.extra_phone == null || data.extra_phone === '' ? null : normText(data.extra_phone);
  const followUpAt = parseFollowUpAt(data.follow_up_at, requireFollowUp ? 'Date and time' : 'Follow-up date and time');
  if (requireFollowUp && !followUpAt) {
    throw new AppError('Pick a date and time', 400);
  }
  return { notes, reason, extraPhone, followUpAt };
}

async function logEnquiryCall(enquiryId, data = {}) {
  const enquiry = await getDemoEnquiryById(enquiryId);
  const outcome = Object.prototype.hasOwnProperty.call(data, 'outcome')
    ? normalizeCallOutcome(data.outcome, { allowPending: true })
    : 'pending';
  const requireFollowUp = CALL_OUTCOMES_REQUIRE_FOLLOW_UP.includes(outcome);
  const { notes, reason, extraPhone, followUpAt } = readCallFeedback(data, { requireFollowUp });

  const result = await pool.query(
    `INSERT INTO demo_enquiry_calls (enquiry_id, outcome, notes, follow_up_at, reason, extra_phone, called_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     RETURNING id, enquiry_id, outcome, notes, follow_up_at, reason, extra_phone, called_at, updated_at`,
    [enquiry.id, outcome, notes, followUpAt, reason, extraPhone]
  );
  const call = result.rows[0];
  const updatedEnquiry =
    outcome === 'pending'
      ? await (async () => {
          await pool.query(`UPDATE demo_enquiries SET last_contacted_at = $2 WHERE id = $1`, [
            enquiry.id,
            call.called_at,
          ]);
          return getDemoEnquiryById(enquiry.id);
        })()
      : await applyCallOutcomeToEnquiry(enquiry.id, {
          outcome,
          followUpAt,
          calledAt: call.called_at,
        });
  return {
    call,
    enquiry: updatedEnquiry,
  };
}

async function updateEnquiryCall(callId, data = {}) {
  const id = Number(callId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('call_id (number) is required', 400);
  }

  const existing = await pool.query(
    `SELECT id, enquiry_id, outcome, notes, follow_up_at, reason, extra_phone, called_at, updated_at
     FROM demo_enquiry_calls
     WHERE id = $1`,
    [id]
  );
  if (existing.rowCount === 0) {
    throw new AppError('Call record not found', 404);
  }
  const current = existing.rows[0];
  const outcome = Object.prototype.hasOwnProperty.call(data, 'outcome')
    ? normalizeCallOutcome(data.outcome, { allowPending: true })
    : current.outcome;
  const requireFollowUp = CALL_OUTCOMES_REQUIRE_FOLLOW_UP.includes(outcome);
  const merged = {
    notes: Object.prototype.hasOwnProperty.call(data, 'notes') ? data.notes : current.notes,
    reason: Object.prototype.hasOwnProperty.call(data, 'reason') ? data.reason : current.reason,
    extra_phone: Object.prototype.hasOwnProperty.call(data, 'extra_phone') ? data.extra_phone : current.extra_phone,
    follow_up_at: Object.prototype.hasOwnProperty.call(data, 'follow_up_at')
      ? data.follow_up_at
      : current.follow_up_at,
  };
  const { notes, reason, extraPhone, followUpAt } = readCallFeedback(merged, { requireFollowUp });

  const result = await pool.query(
    `UPDATE demo_enquiry_calls
     SET outcome = $2, notes = $3, follow_up_at = $4, reason = $5, extra_phone = $6, updated_at = NOW()
     WHERE id = $1
     RETURNING id, enquiry_id, outcome, notes, follow_up_at, reason, extra_phone, called_at, updated_at`,
    [current.id, outcome, notes, followUpAt, reason, extraPhone]
  );

  const updatedEnquiry =
    outcome === 'pending'
      ? await getDemoEnquiryById(current.enquiry_id)
      : await applyCallOutcomeToEnquiry(current.enquiry_id, {
          outcome,
          followUpAt,
          calledAt: current.called_at,
        });

  return {
    call: result.rows[0],
    enquiry: updatedEnquiry,
  };
}

async function convertEnquiryToCompany(enquiryId, companyPayload) {
  const enquiry = await getDemoEnquiryById(enquiryId);
  if (enquiry.converted_company_id) {
    throw new AppError('This lead is already converted to a company', 400);
  }
  if (enquiry.status === 'lost') {
    throw new AppError('Cannot convert a lost lead. Change status first.', 400);
  }

  const authService = require('./authService');
  const { recordPaymentsFromBillingChange } = require('./paymentLedgerService');

  const provisioned = await authService.createCompanyProvisionedBySuperadmin(companyPayload);

  const updateResult = await pool.query(
    `UPDATE demo_enquiries
     SET status = 'converted',
         converted_company_id = $2,
         converted_at = NOW(),
         status_updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [enquiry.id, provisioned.company.id]
  );

  if (updateResult.rowCount === 0) {
    throw new AppError('Failed to link lead to company', 500);
  }

  const companyFull = await pool.query(
    `SELECT id, plan_code, onetime_fee_amount, amc_amount, onetime_payment_status, amc_payment_status,
            onetime_fee_paid, last_onetime_payment_date, last_amc_payment_date
     FROM companies WHERE id = $1`,
    [provisioned.company.id]
  );
  if (companyFull.rows[0]) {
    await recordPaymentsFromBillingChange(null, companyFull.rows[0], 'lead_conversion');
  }

  const updatedEnquiry = await getDemoEnquiryById(enquiry.id);

  return {
    enquiry: updatedEnquiry,
    company: provisioned.company,
    user: provisioned.user,
    admin_password_plaintext_once: provisioned.admin_password_plaintext_once,
  };
}

async function deleteDemoEnquiry(enquiryId) {
  const enquiry = await getDemoEnquiryById(enquiryId);
  const result = await pool.query(
    `DELETE FROM demo_enquiries WHERE id = $1 RETURNING id, full_name, business_name`,
    [enquiry.id]
  );
  if (result.rowCount === 0) {
    throw new AppError('Enquiry not found', 404);
  }
  return result.rows[0];
}

module.exports = {
  createDemoEnquiry,
  createAdminLead,
  phoneMatchKey,
  findDemoEnquiriesByPhone,
  getDemoEnquiryById,
  listDemoEnquiries,
  getDemoEnquiryStats,
  updateDemoEnquiryStatus,
  updateDemoEnquiryNotes,
  updateDemoEnquiryDetails,
  bookDemoEnquiry,
  listScheduledDemos,
  listEnquiryCalls,
  logEnquiryCall,
  updateEnquiryCall,
  convertEnquiryToCompany,
  deleteDemoEnquiry,
  getDemoEnquirySuggestions,
  DEMO_ENQUIRY_STATUSES,
  DEFAULT_LEAD_SOURCE_SUGGESTIONS,
  DEFAULT_CITY_SUGGESTIONS,
  DEFAULT_STATE_SUGGESTIONS,
};
