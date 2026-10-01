const { pool } = require('../config/database');
const { isSubscriptionAllowed } = require('./companyService');
const {
  loadCompanyForMobile,
  loadEmployeeForMobile,
  isEmployeeChannelAllowed,
  mobileReject,
} = require('./mobileAttendanceService');
const FIELD_MAX_ACCURACY_M = Number(process.env.FIELD_MAX_GPS_ACCURACY_M || 200);
const {
  listAssignedFieldSites,
  findMatchingFieldSite,
} = require('./fieldSiteService');
const {
  getMobileFaceProfile,
  embeddingMatchesStoredTemplates,
  MOBILEFACE_MODEL,
  MOBILEFACE_DIMENSION,
  MOBILEFACE_MATCH_THRESHOLD,
} = require('./faceEnrollmentService');
const {
  recordPunchAttempt,
  inferNextPunchType,
  getEmployeeTodaySummary,
  getEmployeeMe,
  getEmployeeMonthlySummary,
} = require('./mobilePunchService');

const FIELD_COOLDOWN_SECONDS = Number(process.env.FIELD_PUNCH_COOLDOWN_SECONDS || 20);

function assertEmployeeFieldEligible({ company, employee }) {
  if (!company.field_attendance_enabled) {
    throw mobileReject(
      'FIELD_DISABLED',
      'Field attendance is not enabled for your company. Contact HR.'
    );
  }

  if (!isSubscriptionAllowed(company)) {
    throw mobileReject(
      'SUBSCRIPTION_EXPIRED',
      'Subscription has expired. Please contact HR to renew.'
    );
  }

  if (String(employee.status) !== 'active') {
    throw mobileReject('EMPLOYEE_INACTIVE', 'Your employee account is not active.');
  }

  if (!isEmployeeChannelAllowed(employee.attendance_channel)) {
    throw mobileReject(
      'EMPLOYEE_CHANNEL_NOT_MOBILE',
      'Field attendance is not enabled for your profile. Contact HR.'
    );
  }
}

function parseGps(latitude, longitude, locationAccuracyM) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const accuracy = Number(locationAccuracyM);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw mobileReject('GPS_DENIED', 'Location is required to mark attendance.', 422);
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw mobileReject('GPS_DENIED', 'Invalid location coordinates.', 422);
  }
  if (!Number.isFinite(accuracy) || accuracy < 0) {
    throw mobileReject('GPS_INACCURATE', 'GPS accuracy reading is required.', 422);
  }
  if (accuracy > FIELD_MAX_ACCURACY_M) {
    throw mobileReject(
      'GPS_INACCURATE',
      `GPS accuracy is too low (${Math.round(accuracy)}m). Wait for a better reading.`,
      422
    );
  }
  return { lat, lng, accuracy };
}

async function processFieldPunch(companyId, employeeId, body, clientIp) {
  const latitude = body.latitude;
  const longitude = body.longitude;
  const locationAccuracyM = body.location_accuracy_m;
  const embedding = body.embedding;
  let fieldSiteId = null;
  let employee = null;

  try {
    employee = await loadEmployeeForMobile(companyId, employeeId);
    const company = await loadCompanyForMobile(companyId);
    assertEmployeeFieldEligible({ company, employee });

    const sites = await listAssignedFieldSites(companyId, employeeId);
    if (sites.length === 0) {
      throw mobileReject(
        'NO_SITES',
        'No field sites are assigned to you. Contact HR.',
        422
      );
    }

    const coords = parseGps(latitude, longitude, locationAccuracyM);
    const match = findMatchingFieldSite(coords.lat, coords.lng, sites);
    if (!match) {
      throw mobileReject(
        'OUTSIDE_SITE',
        'You must be at an assigned field site to mark attendance.',
        422
      );
    }
    fieldSiteId = match.site.id;

    const profile = await getMobileFaceProfile(companyId, employeeId);
    if (!profile || !Array.isArray(profile.embeddings) || profile.embeddings.length === 0) {
      throw mobileReject(
        'NOT_ENROLLED',
        'Register your face in PunchPay Field before punching.',
        422
      );
    }

    if (embedding) {
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

    const punchTime = new Date();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const recent = await client.query(
        `SELECT punch_time
         FROM attendance_logs
         WHERE company_id = $1
           AND employee_id = $2
           AND device_id = 'field'
           AND punch_time >= NOW() - ($3::int * INTERVAL '1 second')
         ORDER BY punch_time DESC
         LIMIT 1`,
        [companyId, employeeId, FIELD_COOLDOWN_SECONDS]
      );
      if (recent.rowCount > 0) {
        throw mobileReject(
          'DUPLICATE_PUNCH',
          `Attendance already marked. Wait ${FIELD_COOLDOWN_SECONDS} seconds before trying again.`,
          409
        );
      }

      const punchType =
        body.punch_type === 'in' || body.punch_type === 'out'
          ? body.punch_type
          : await inferNextPunchType(client, companyId, employeeId, punchTime);
      const insertResult = await client.query(
        `INSERT INTO attendance_logs (
           company_id, employee_id, punch_time, punch_type, device_id, branch_id,
           punch_source, latitude, longitude, location_accuracy_m, field_site_id
         ) VALUES ($1, $2, $3, $4, 'field', $5, 'field', $6, $7, $8, $9)
         ON CONFLICT (employee_id, punch_time) DO NOTHING
         RETURNING id, employee_id, punch_time, punch_type, device_id, punch_source, field_site_id`,
        [
          companyId,
          employeeId,
          punchTime.toISOString(),
          punchType,
          employee.branch_id,
          coords.lat,
          coords.lng,
          coords.accuracy,
          fieldSiteId,
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
        branchId: employee.branch_id,
        status: 'accepted',
        latitude: coords.lat,
        longitude: coords.lng,
        locationAccuracyM: coords.accuracy,
        clientIp,
        punchSource: 'field',
        fieldSiteId,
      });

      return {
        punch,
        today,
        site: {
          id: match.site.id,
          name: match.site.name,
          distance_m: Math.round(match.distanceM),
        },
      };
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
      branchId: employee?.branch_id ?? null,
      status: 'rejected',
      rejectReason: err.code || err.message,
      latitude: latitude != null ? Number(latitude) : null,
      longitude: longitude != null ? Number(longitude) : null,
      locationAccuracyM: locationAccuracyM != null ? Number(locationAccuracyM) : null,
      clientIp,
      punchSource: 'field',
      fieldSiteId,
    });
    throw err;
  }
}

async function getFieldMe(companyId, employeeId) {
  const me = await getEmployeeMe(companyId, employeeId);
  const company = await loadCompanyForMobile(companyId);
  const sites = await listAssignedFieldSites(companyId, employeeId);
  const profile = await getMobileFaceProfile(companyId, employeeId);
  return {
    ...me,
    company: {
      ...me.company,
      field_attendance_enabled: Boolean(company.field_attendance_enabled),
    },
    sites,
    enrolled: Boolean(profile),
    face: profile
      ? {
          model: profile.model || MOBILEFACE_MODEL,
          dimension: profile.dimension || MOBILEFACE_DIMENSION,
          match_threshold: MOBILEFACE_MATCH_THRESHOLD,
          embeddings: profile.embeddings,
          enrolled_at: profile.enrolled_at,
        }
      : null,
  };
}

module.exports = {
  processFieldPunch,
  getFieldMe,
  getEmployeeTodaySummary,
  getEmployeeMonthlySummary,
  assertEmployeeFieldEligible,
  parseGps,
  FIELD_COOLDOWN_SECONDS,
  FIELD_MAX_ACCURACY_M,
};
