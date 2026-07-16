const { pool } = require('../config/database');
const {
  loadCompanyForMobile,
  loadBranchForMobile,
  loadEmployeeForMobile,
  mobileReject,
} = require('./mobileAttendanceService');
const {
  recordPunchAttempt,
  inferNextPunchType,
  getEmployeeTodaySummary,
} = require('./mobilePunchService');
const { computeFaceDescriptor, matchDescriptor } = require('./faceRecognitionService');
const { listBranchFaceCandidates } = require('./faceEnrollmentService');
const { touchKioskSeen, normalizeDuplicatePunchSeconds, normalizeMinRecognizeSeconds } = require('./kioskDeviceService');

function assertKioskPunchAllowed({ company, branch, employee, kioskBranchId }) {
  if (!company.mobile_attendance_enabled) {
    throw mobileReject('MOBILE_DISABLED', 'Mobile attendance is not enabled for your company.', 403);
  }
  if (!branch.mobile_attendance_enabled) {
    throw mobileReject('BRANCH_MOBILE_DISABLED', 'Mobile attendance is disabled for this branch.', 403);
  }
  if (String(employee.status) !== 'active') {
    throw mobileReject('EMPLOYEE_INACTIVE', 'Employee account is not active.', 403);
  }
  if (Number(employee.branch_id) !== Number(kioskBranchId)) {
    throw mobileReject('BRANCH_MISMATCH', 'Employee belongs to a different branch.', 403);
  }
}

async function recognizeKioskFace(kiosk, imageBuffer) {
  const companyId = kiosk.company_id;
  const branchId = kiosk.branch_id;

  const company = await loadCompanyForMobile(companyId);
  const branch = await loadBranchForMobile(companyId, branchId);

  const descriptor = await computeFaceDescriptor(imageBuffer);
  if (!descriptor) {
    throw mobileReject('FACE_NOT_DETECTED', 'No face detected. Look at the camera.', 422);
  }

  const candidates = await listBranchFaceCandidates(companyId, branchId);
  if (candidates.length === 0) {
    throw mobileReject(
      'FACE_NOT_ENROLLED',
      'No employees enrolled for face attendance at this branch.',
      422
    );
  }

  const match = matchDescriptor(descriptor, candidates);
  if (!match) {
    throw mobileReject('FACE_NOT_RECOGNIZED', 'Face not recognized. Contact HR to enroll.', 422);
  }

  const employee = await loadEmployeeForMobile(companyId, match.employee_id);
  assertKioskPunchAllowed({ company, branch, employee, kioskBranchId: branchId });

  return {
    employee: {
      id: employee.id,
      name: employee.name,
      employee_code: employee.employee_code,
    },
    match_distance: match.distance,
    min_recognize_seconds: normalizeMinRecognizeSeconds(kiosk.min_recognize_seconds),
  };
}

async function processKioskFacePunch(kiosk, imageBuffer, clientIp) {
  const companyId = kiosk.company_id;
  const branchId = kiosk.branch_id;
  let employeeId = null;

  try {
    const recognized = await recognizeKioskFace(kiosk, imageBuffer);
    employeeId = recognized.employee.id;
    const employee = await loadEmployeeForMobile(companyId, employeeId);

    const punchTime = new Date();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const cooldownSeconds = normalizeDuplicatePunchSeconds(
        kiosk.duplicate_punch_seconds,
        Number(process.env.KIOSK_EMPLOYEE_COOLDOWN_SECONDS || 90)
      );
      const recentResult = await client.query(
        `SELECT punch_time
         FROM attendance_logs
         WHERE company_id = $1
           AND employee_id = $2
           AND device_id = 'kiosk'
           AND punch_time >= NOW() - ($3::int * INTERVAL '1 second')
         ORDER BY punch_time DESC
         LIMIT 1`,
        [companyId, employeeId, cooldownSeconds]
      );
      if (recentResult.rowCount > 0) {
        throw mobileReject(
          'DUPLICATE_PUNCH',
          `Attendance already marked. Wait ${cooldownSeconds} seconds before trying again.`,
          409
        );
      }

      const punchType = await inferNextPunchType(client, companyId, employeeId, punchTime);

      const insertResult = await client.query(
        `INSERT INTO attendance_logs (
           company_id, employee_id, punch_time, punch_type, device_id, branch_id, punch_source
         ) VALUES ($1, $2, $3, $4, 'kiosk', $5, 'kiosk')
         ON CONFLICT (employee_id, punch_time) DO NOTHING
         RETURNING id, employee_id, punch_time, punch_type, device_id, punch_source`,
        [companyId, employeeId, punchTime.toISOString(), punchType, branchId]
      );

      if (insertResult.rowCount === 0) {
        throw mobileReject(
          'DUPLICATE_PUNCH',
          'A punch already exists at this time. Please wait a moment.',
          409
        );
      }

      await client.query('COMMIT');

      const punch = insertResult.rows[0];
      await touchKioskSeen(kiosk.id);

      await recordPunchAttempt({
        companyId,
        employeeId,
        branchId,
        status: 'accepted',
        rejectReason: null,
        clientIp,
      });

      return {
        punch,
        employee: {
          id: employee.id,
          name: employee.name,
          employee_code: employee.employee_code,
        },
        match_distance: recognized.match_distance,
        today: await getEmployeeTodaySummary(companyId, employeeId),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    // Automatic kiosk scanning produces normal "no face" frames. Do not flood
    // the audit table with those expected frames.
    if (err.code !== 'FACE_NOT_DETECTED' && err.code !== 'FACE_NOT_RECOGNIZED') {
      await recordPunchAttempt({
        companyId,
        employeeId,
        branchId,
        status: 'rejected',
        rejectReason: err.code || err.message,
        clientIp,
      });
    }
    throw err;
  }
}

module.exports = {
  recognizeKioskFace,
  processKioskFacePunch,
  assertKioskPunchAllowed,
};
