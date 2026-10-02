const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { todayIstYmd } = require('../utils/istDate');
const {
  loadCompanyForMobile,
  loadEmployeeForMobile,
  mobileReject,
} = require('./mobileAttendanceService');
const {
  assertEmployeeFieldEligible,
  parseGps,
  FIELD_COOLDOWN_SECONDS,
} = require('./fieldPunchService');
const {
  getMobileFaceProfile,
  embeddingMatchesStoredTemplates,
  MOBILEFACE_DIMENSION,
} = require('./faceEnrollmentService');
const {
  recordPunchAttempt,
  getEmployeeTodaySummary,
} = require('./mobilePunchService');

function assertBeatEnabled(employee) {
  if (!employee.field_beat_enabled) {
    throw mobileReject(
      'BEAT_NOT_ENABLED',
      'Door-to-door visits are not enabled for your profile. Contact HR.',
      403
    );
  }
}

async function matchFace(companyId, employeeId, embedding) {
  const profile = await getMobileFaceProfile(companyId, employeeId);
  if (!profile || !Array.isArray(profile.embeddings) || profile.embeddings.length === 0) {
    throw mobileReject(
      'NOT_ENROLLED',
      'Register your face in PunchPay Field before punching.',
      422
    );
  }
  if (
    !Array.isArray(embedding) ||
    embedding.length !== MOBILEFACE_DIMENSION ||
    !embeddingMatchesStoredTemplates(embedding, profile.embeddings)
  ) {
    throw mobileReject(
      'FACE_MISMATCH',
      'Face did not match your enrolled profile. Try again in better light.',
      422
    );
  }
}

async function loadOpenDay(client, companyId, employeeId, workDate) {
  const result = await client.query(
    `SELECT *
     FROM field_days
     WHERE company_id = $1 AND employee_id = $2 AND work_date = $3
     FOR UPDATE`,
    [companyId, employeeId, workDate]
  );
  return result.rows[0] || null;
}

async function insertFieldPunch(client, { companyId, employee, punchType, coords, punchTime }) {
  const recent = await client.query(
    `SELECT punch_time
     FROM attendance_logs
     WHERE company_id = $1
       AND employee_id = $2
       AND device_id = 'field'
       AND punch_time >= NOW() - ($3::int * INTERVAL '1 second')
     ORDER BY punch_time DESC
     LIMIT 1`,
    [companyId, employee.id, FIELD_COOLDOWN_SECONDS]
  );
  if (recent.rowCount > 0) {
    throw mobileReject(
      'DUPLICATE_PUNCH',
      `Attendance already marked. Wait ${FIELD_COOLDOWN_SECONDS} seconds before trying again.`,
      409
    );
  }

  const insertResult = await client.query(
    `INSERT INTO attendance_logs (
       company_id, employee_id, punch_time, punch_type, device_id, branch_id,
       punch_source, latitude, longitude, location_accuracy_m, field_site_id
     ) VALUES ($1, $2, $3, $4, 'field', $5, 'field', $6, $7, $8, NULL)
     ON CONFLICT (employee_id, punch_time) DO NOTHING
     RETURNING id, employee_id, punch_time, punch_type, device_id, punch_source, field_site_id`,
    [
      companyId,
      employee.id,
      punchTime.toISOString(),
      punchType,
      employee.branch_id,
      coords.lat,
      coords.lng,
      coords.accuracy,
    ]
  );
  if (insertResult.rowCount === 0) {
    throw mobileReject(
      'DUPLICATE_PUNCH',
      'A punch already exists at this time. Please wait a moment and try again.',
      409
    );
  }
  return insertResult.rows[0];
}

function serializeDay(row, visits = []) {
  if (!row) {
    return {
      work_date: todayIstYmd(),
      started: false,
      ended: false,
      started_at: null,
      ended_at: null,
      visit_count: 0,
      visits,
    };
  }
  return {
    id: Number(row.id),
    work_date: row.work_date,
    started: true,
    ended: Boolean(row.ended_at),
    started_at: row.started_at,
    ended_at: row.ended_at || null,
    start: {
      latitude: Number(row.start_latitude),
      longitude: Number(row.start_longitude),
      accuracy_m: row.start_accuracy_m != null ? Number(row.start_accuracy_m) : null,
    },
    end: row.ended_at
      ? {
          latitude: Number(row.end_latitude),
          longitude: Number(row.end_longitude),
          accuracy_m: row.end_accuracy_m != null ? Number(row.end_accuracy_m) : null,
        }
      : null,
    visit_count: visits.length,
    visits,
  };
}

async function listVisitsForDay(companyId, fieldDayId) {
  const result = await pool.query(
    `SELECT id, visited_at, latitude, longitude, location_accuracy_m, label
     FROM field_visits
     WHERE company_id = $1 AND field_day_id = $2
     ORDER BY visited_at ASC`,
    [companyId, fieldDayId]
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    visited_at: row.visited_at,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    location_accuracy_m:
      row.location_accuracy_m != null ? Number(row.location_accuracy_m) : null,
    label: row.label || null,
  }));
}

async function getBeatToday(companyId, employeeId) {
  const workDate = todayIstYmd();
  const day = await pool.query(
    `SELECT *
     FROM field_days
     WHERE company_id = $1 AND employee_id = $2 AND work_date = $3`,
    [companyId, employeeId, workDate]
  );
  const row = day.rows[0] || null;
  const visits = row ? await listVisitsForDay(companyId, row.id) : [];
  return serializeDay(row, visits);
}

async function processBeatAction(companyId, employeeId, action, body, clientIp) {
  const latitude = body.latitude;
  const longitude = body.longitude;
  const locationAccuracyM = body.location_accuracy_m;
  const embedding = body.embedding;
  let employee = null;

  try {
    employee = await loadEmployeeForMobile(companyId, employeeId);
    const company = await loadCompanyForMobile(companyId);
    assertEmployeeFieldEligible({ company, employee });
    assertBeatEnabled(employee);
    await matchFace(companyId, employeeId, embedding);
    const coords = parseGps(latitude, longitude, locationAccuracyM);
    const workDate = todayIstYmd();
    const punchTime = new Date();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await loadOpenDay(client, companyId, employeeId, workDate);

      if (action === 'start') {
        if (existing && !existing.ended_at) {
          throw mobileReject('DAY_ALREADY_STARTED', 'You already started today.', 409);
        }
        if (existing && existing.ended_at) {
          throw mobileReject('DAY_ALREADY_ENDED', 'Today is already closed. Wait until tomorrow.', 409);
        }
        const punch = await insertFieldPunch(client, {
          companyId,
          employee,
          punchType: 'in',
          coords,
          punchTime,
        });
        const inserted = await client.query(
          `INSERT INTO field_days (
             company_id, employee_id, work_date, started_at,
             start_latitude, start_longitude, start_accuracy_m, start_punch_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            companyId,
            employeeId,
            workDate,
            punchTime.toISOString(),
            coords.lat,
            coords.lng,
            coords.accuracy,
            punch.id,
          ]
        );
        await client.query('COMMIT');
        await recordPunchAttempt({
          companyId,
          employeeId,
          branchId: employee.branch_id,
          status: 'accepted',
          latitude: coords.lat,
          longitude: coords.lng,
          locationAccuracyM: coords.accuracy,
          clientIp,
          punchSource: 'field',
        });
        const today = await getEmployeeTodaySummary(companyId, employeeId);
        return {
          punch,
          today,
          beat: serializeDay(inserted.rows[0], []),
        };
      }

      if (!existing) {
        throw mobileReject('DAY_NOT_STARTED', 'Start your day before adding visits or ending.', 422);
      }
      if (existing.ended_at) {
        throw mobileReject('DAY_ALREADY_ENDED', 'Today is already closed.', 409);
      }

      if (action === 'visit') {
        const visit = await client.query(
          `INSERT INTO field_visits (
             company_id, employee_id, field_day_id, visited_at,
             latitude, longitude, location_accuracy_m, label
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, visited_at, latitude, longitude, location_accuracy_m, label`,
          [
            companyId,
            employeeId,
            existing.id,
            punchTime.toISOString(),
            coords.lat,
            coords.lng,
            coords.accuracy,
            body.label || null,
          ]
        );
        await client.query('COMMIT');
        const visits = await listVisitsForDay(companyId, existing.id);
        const today = await getEmployeeTodaySummary(companyId, employeeId);
        return {
          visit: {
            id: Number(visit.rows[0].id),
            visited_at: visit.rows[0].visited_at,
            latitude: Number(visit.rows[0].latitude),
            longitude: Number(visit.rows[0].longitude),
            location_accuracy_m:
              visit.rows[0].location_accuracy_m != null
                ? Number(visit.rows[0].location_accuracy_m)
                : null,
            label: visit.rows[0].label || null,
          },
          today,
          beat: serializeDay(existing, visits),
        };
      }

      if (action === 'end') {
        const punch = await insertFieldPunch(client, {
          companyId,
          employee,
          punchType: 'out',
          coords,
          punchTime,
        });
        const updated = await client.query(
          `UPDATE field_days
           SET ended_at = $4,
               end_latitude = $5,
               end_longitude = $6,
               end_accuracy_m = $7,
               end_punch_id = $8
           WHERE id = $1 AND company_id = $2 AND employee_id = $3
           RETURNING *`,
          [
            existing.id,
            companyId,
            employeeId,
            punchTime.toISOString(),
            coords.lat,
            coords.lng,
            coords.accuracy,
            punch.id,
          ]
        );
        await client.query('COMMIT');
        await recordPunchAttempt({
          companyId,
          employeeId,
          branchId: employee.branch_id,
          status: 'accepted',
          latitude: coords.lat,
          longitude: coords.lng,
          locationAccuracyM: coords.accuracy,
          clientIp,
          punchSource: 'field',
        });
        const visits = await listVisitsForDay(companyId, existing.id);
        const today = await getEmployeeTodaySummary(companyId, employeeId);
        return {
          punch,
          today,
          beat: serializeDay(updated.rows[0], visits),
        };
      }

      throw new AppError('Unknown beat action', 400);
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    await recordPunchAttempt({
      companyId,
      employeeId,
      branchId: employee?.branch_id ?? null,
      status: 'rejected',
      rejectReason: err.code || err.message,
      latitude: latitude != null ? Number(latitude) : null,
      longitude: longitude != null ? Number(longitude) : null,
      locationAccuracyM: locationAccuracyM != null ? Number(locationAccuracyM) : null,
      clientIp,
      punchSource: 'field',
    });
    throw err;
  }
}

async function setEmployeeFieldBeat(companyId, employeeId, enabled) {
  const result = await pool.query(
    `UPDATE employees
     SET field_beat_enabled = $3
     WHERE company_id = $1 AND id = $2
     RETURNING id, field_beat_enabled, attendance_channel`,
    [companyId, employeeId, Boolean(enabled)]
  );
  if (result.rowCount === 0) {
    throw new AppError('Employee not found', 404);
  }
  const row = result.rows[0];
  if (
    enabled &&
    row.attendance_channel !== 'mobile' &&
    row.attendance_channel !== 'both'
  ) {
    await pool.query(
      `UPDATE employees SET attendance_channel = 'both' WHERE company_id = $1 AND id = $2`,
      [companyId, employeeId]
    );
    row.attendance_channel = 'both';
  }
  return {
    id: Number(row.id),
    field_beat_enabled: Boolean(row.field_beat_enabled),
    attendance_channel: row.attendance_channel,
  };
}

async function listCompanyBeatDays(companyId, workDate, allowedBranchIds = null) {
  const date = workDate || todayIstYmd();
  const params = [companyId, date];
  let branchClause = '';
  if (allowedBranchIds != null) {
    if (allowedBranchIds.length === 0) {
      return { work_date: date, days: [] };
    }
    params.push(allowedBranchIds);
    branchClause = ` AND e.branch_id = ANY($3::bigint[])`;
  }

  const result = await pool.query(
    `SELECT
       fd.*,
       e.name,
       e.employee_code,
       e.branch_id,
       (SELECT COUNT(*)::int FROM field_visits fv WHERE fv.field_day_id = fd.id) AS visit_count
     FROM field_days fd
     INNER JOIN employees e ON e.id = fd.employee_id AND e.company_id = fd.company_id
     WHERE fd.company_id = $1 AND fd.work_date = $2${branchClause}
     ORDER BY LOWER(TRIM(e.name)) ASC, fd.started_at ASC`,
    params
  );

  const days = [];
  for (const row of result.rows) {
    const visits = await listVisitsForDay(companyId, row.id);
    days.push({
      employee_id: Number(row.employee_id),
      name: row.name,
      employee_code: row.employee_code,
      ...serializeDay(row, visits),
    });
  }
  return { work_date: date, days };
}

module.exports = {
  getBeatToday,
  processBeatAction,
  setEmployeeFieldBeat,
  listCompanyBeatDays,
};
