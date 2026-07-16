const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { dayBounds, ymdFromDate, runWithCompanyTimezone } = require('../utils/companyDate');
const { getCompanyTimezone } = require('./companyService');
const { getDailyAttendance, getMonthlyAttendance } = require('./attendanceService');
const {
  loadCompanyForMobile,
  loadBranchForMobile,
  loadEmployeeForMobile,
  assertEmployeeMobileEligible,
  assertMobilePunchAllowed,
  mobileReject,
} = require('./mobileAttendanceService');
const { validateGeofence } = require('./mobileGeofenceService');
const { findValidQrNonce, validateAndConsume } = require('./mobileQrService');

async function withCompanyTimezone(companyId, fn) {
  const tz = await getCompanyTimezone(companyId);
  return runWithCompanyTimezone(tz, fn);
}

async function recordPunchAttempt({
  companyId,
  employeeId,
  branchId,
  status,
  rejectReason,
  latitude,
  longitude,
  locationAccuracyM,
  qrNonce,
  clientIp,
}) {
  try {
    await pool.query(
      `INSERT INTO mobile_punch_attempts (
         company_id, employee_id, branch_id, status, reject_reason,
         latitude, longitude, location_accuracy_m, qr_nonce, client_ip
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::inet)`,
      [
        companyId,
        employeeId ?? null,
        branchId ?? null,
        status,
        rejectReason ?? null,
        latitude ?? null,
        longitude ?? null,
        locationAccuracyM ?? null,
        qrNonce ?? null,
        clientIp ?? null,
      ]
    );
  } catch (err) {
    console.error('Failed to record mobile punch attempt:', err?.message || err);
  }
}

async function inferNextPunchType(client, companyId, employeeId, punchTime) {
  const ymd = ymdFromDate(punchTime);
  const { start, end } = dayBounds(ymd);
  const result = await client.query(
    `SELECT punch_type
     FROM attendance_logs
     WHERE company_id = $1 AND employee_id = $2
       AND punch_time >= $3 AND punch_time < $4
     ORDER BY punch_time ASC`,
    [companyId, employeeId, start, end]
  );
  return result.rowCount % 2 === 0 ? 'in' : 'out';
}

function deriveTodayStatus(punches) {
  if (!punches || punches.length === 0) {
    return 'not_checked_in';
  }
  const sorted = [...punches].sort(
    (a, b) => new Date(a.punch_time) - new Date(b.punch_time)
  );
  const last = sorted[sorted.length - 1];
  return String(last.punch_type).toLowerCase() === 'in' ? 'checked_in' : 'checked_out';
}

async function getEmployeeTodaySummary(companyId, employeeId) {
  return withCompanyTimezone(companyId, async () => {
    const ymd = ymdFromDate(new Date());
    const rows = await getDailyAttendance(companyId, ymd, employeeId, null, null, null);
    const employeeRow = rows[0];
    const punches = employeeRow?.punches || [];
    return {
      status: deriveTodayStatus(punches),
      punches: punches.map((p) => ({
        id: p.id,
        punch_time: p.punch_time,
        punch_type: p.punch_type,
        device_id: p.device_id,
        punch_source: p.punch_source ?? null,
      })),
      present: employeeRow?.present ?? false,
      late: employeeRow?.late ?? false,
    };
  });
}

async function getEmployeeMonthlySummary(companyId, employeeId, year, month) {
  const data = await getMonthlyAttendance(companyId, year, month, employeeId, null, null, null);
  const employee = data.employees?.[0];
  if (!employee) {
    return { year: data.year, month: data.month, days: [], summary: null };
  }
  return {
    year: data.year,
    month: data.month,
    days: employee.days || [],
    summary: {
      present_days: employee.present_days,
      absent_days: employee.absent_days,
      late_days: employee.late_days,
      overtime_hours: employee.overtime_hours,
    },
  };
}

/**
 * Process a mobile QR + GPS punch for the authenticated employee.
 */
async function processMobilePunch(companyId, employeeId, body, clientIp) {
  const qrNonce = String(body.qr_nonce || '').trim();
  const latitude = body.latitude;
  const longitude = body.longitude;
  const locationAccuracyM = body.location_accuracy_m;

  let branchId = null;
  let employee = null;
  let company = null;
  let branch = null;

  try {
    employee = await loadEmployeeForMobile(companyId, employeeId);
    company = await loadCompanyForMobile(companyId);
    assertEmployeeMobileEligible({ company, employee });

    // Peek first so a failed geofence/eligibility check does not burn the QR.
    const peeked = await findValidQrNonce(qrNonce, companyId);
    branchId = peeked.branch_id;
    branch = await loadBranchForMobile(companyId, branchId);

    assertMobilePunchAllowed({ company, branch, employee, qrBranchId: branchId });

    const coords = validateGeofence(latitude, longitude, locationAccuracyM, branch);
    const punchTime = new Date();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Consume only after checks pass, inside the same transaction as the punch.
      await validateAndConsume(qrNonce, companyId, client);

      const punchType = await inferNextPunchType(client, companyId, employeeId, punchTime);

      const insertResult = await client.query(
        `INSERT INTO attendance_logs (
           company_id, employee_id, punch_time, punch_type, device_id, branch_id,
           punch_source, latitude, longitude, location_accuracy_m, qr_nonce
         ) VALUES ($1, $2, $3, $4, 'mobile', $5, 'mobile', $6, $7, $8, $9)
         ON CONFLICT (employee_id, punch_time) DO NOTHING
         RETURNING id, employee_id, punch_time, punch_type, device_id, punch_source`,
        [
          companyId,
          employeeId,
          punchTime.toISOString(),
          punchType,
          branchId,
          coords.lat,
          coords.lng,
          coords.accuracy,
          qrNonce,
        ]
      );

      if (insertResult.rowCount === 0) {
        throw mobileReject(
          'DUPLICATE_PUNCH',
          'A punch already exists at this time. Please wait a moment and try again.',
          409
        );
      }

      await client.query('COMMIT');

      const punch = insertResult.rows[0];
      const today = await getEmployeeTodaySummary(companyId, employeeId);

      await recordPunchAttempt({
        companyId,
        employeeId,
        branchId,
        status: 'accepted',
        latitude: coords.lat,
        longitude: coords.lng,
        locationAccuracyM: coords.accuracy,
        qrNonce,
        clientIp,
      });

      return { punch, today };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    await recordPunchAttempt({
      companyId,
      employeeId,
      branchId,
      status: 'rejected',
      rejectReason: err.code || err.message,
      latitude: latitude != null ? Number(latitude) : null,
      longitude: longitude != null ? Number(longitude) : null,
      locationAccuracyM: locationAccuracyM != null ? Number(locationAccuracyM) : null,
      qrNonce,
      clientIp,
    });
    throw err;
  }
}

async function getEmployeeMe(companyId, employeeId) {
  const employee = await loadEmployeeForMobile(companyId, employeeId);
  const company = await loadCompanyForMobile(companyId);
  const branch = await loadBranchForMobile(companyId, employee.branch_id);

  const shiftResult = await pool.query(
    `SELECT id, shift_name, start_time, end_time
     FROM shifts
     WHERE company_id = $1 AND id = $2`,
    [companyId, employee.shift_id]
  );

  const today = await getEmployeeTodaySummary(companyId, employeeId);

  return {
    employee: {
      id: employee.id,
      name: employee.name,
      employee_code: employee.employee_code,
      attendance_channel: employee.attendance_channel,
      branch_id: employee.branch_id,
    },
    company: {
      id: company.id,
      name: company.name,
      mobile_attendance_enabled: company.mobile_attendance_enabled,
    },
    branch: {
      id: branch.id,
      name: branch.name,
    },
    shift: shiftResult.rows[0] || null,
    today,
  };
}

module.exports = {
  processMobilePunch,
  getEmployeeMe,
  getEmployeeTodaySummary,
  getEmployeeMonthlySummary,
  inferNextPunchType,
  deriveTodayStatus,
  recordPunchAttempt,
};
