const { resolveKioskFromToken, preferencesFromKiosk, updateKioskPreferences } = require('../services/kioskDeviceService');
const { processKioskFacePunch, recognizeKioskFace } = require('../services/kioskPunchService');
const {
  listBranchFaceCandidates,
  listBranchEmployeeEnrollments,
  enrollEmployeeFace,
  removeEmployeeFace,
} = require('../services/faceEnrollmentService');
const { modelsInstalled } = require('../services/faceRecognitionService');
const {
  assertEmployeeAtKioskBranch,
  listKioskAttendanceLogs,
} = require('../services/kioskSettingsService');
const { AppError } = require('../utils/AppError');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function parseImageBody(req) {
  if (req.file?.buffer) return req.file.buffer;
  const body = req.body || {};
  if (body.image_base64) {
    const raw = String(body.image_base64).replace(/^data:image\/\w+;base64,/, '');
    return Buffer.from(raw, 'base64');
  }
  return null;
}

const activateKiosk = asyncHandler(async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const kiosk = await resolveKioskFromToken(token);
  if (!kiosk) {
    return res.status(401).json({
      success: false,
      code: 'KIOSK_UNAUTHORIZED',
      message: 'Invalid or revoked kiosk code',
    });
  }

  return res.json({
    success: true,
    data: {
      company: { id: kiosk.company_id, name: kiosk.company_name },
      branch: { id: kiosk.branch_id, name: kiosk.branch_name },
      label: kiosk.label,
      face_models_ready: modelsInstalled(),
      preferences: preferencesFromKiosk(kiosk),
    },
  });
});

const getKioskStatus = asyncHandler(async (req, res) => {
  const kiosk = req.kiosk;
  const enrolled = await listBranchFaceCandidates(kiosk.company_id, kiosk.branch_id);
  return res.json({
    success: true,
    data: {
      company: { id: kiosk.company_id, name: kiosk.company_name },
      branch: { id: kiosk.branch_id, name: kiosk.branch_name },
      label: kiosk.label,
      enrolled_count: enrolled.length,
      face_models_ready: modelsInstalled(),
      preferences: preferencesFromKiosk(kiosk),
    },
  });
});

const getKioskPreferences = asyncHandler(async (req, res) => {
  return res.json({
    success: true,
    data: preferencesFromKiosk(req.kiosk),
  });
});

const updateKioskPreferencesHandler = asyncHandler(async (req, res) => {
  const kiosk = await updateKioskPreferences(req.kiosk.company_id, req.kiosk.branch_id, {
    duplicatePunchSeconds: req.body?.duplicate_punch_seconds,
    minRecognizeSeconds: req.body?.min_recognize_seconds,
  });
  return res.json({
    success: true,
    data: preferencesFromKiosk(kiosk),
    message: 'Preferences saved.',
  });
});

const kioskFaceRecognize = asyncHandler(async (req, res) => {
  const imageBuffer = parseImageBody(req);
  if (!imageBuffer || imageBuffer.length < 100) {
    return res.status(400).json({
      success: false,
      message: 'image_base64 or multipart image is required',
    });
  }

  const result = await recognizeKioskFace(req.kiosk, imageBuffer);
  return res.json({ success: true, data: result });
});

const kioskFacePunch = asyncHandler(async (req, res) => {
  const imageBuffer = parseImageBody(req);
  if (!imageBuffer || imageBuffer.length < 100) {
    return res.status(400).json({
      success: false,
      message: 'image_base64 or multipart image is required',
    });
  }

  const result = await processKioskFacePunch(req.kiosk, imageBuffer, req.ip);
  return res.json({ success: true, data: result });
});

const listKioskEmployees = asyncHandler(async (req, res) => {
  const items = await listBranchEmployeeEnrollments(
    req.kiosk.company_id,
    req.kiosk.branch_id
  );
  return res.json({ success: true, data: { items } });
});

const enrollKioskEmployeeFace = asyncHandler(async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  if (!employeeId) throw new AppError('Invalid employee id', 400);

  const imageBuffer = parseImageBody(req);
  if (!imageBuffer || imageBuffer.length < 100) {
    throw new AppError('Employee face photo is required', 400);
  }

  await assertEmployeeAtKioskBranch(
    req.kiosk.company_id,
    req.kiosk.branch_id,
    employeeId
  );
  const result = await enrollEmployeeFace(
    req.kiosk.company_id,
    employeeId,
    imageBuffer,
    null
  );
  return res.status(201).json({
    success: true,
    data: result.enrollment,
    message: `Face enrolled for ${result.employee.name}`,
  });
});

const removeKioskEmployeeFace = asyncHandler(async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  if (!employeeId) throw new AppError('Invalid employee id', 400);

  await assertEmployeeAtKioskBranch(
    req.kiosk.company_id,
    req.kiosk.branch_id,
    employeeId
  );
  await removeEmployeeFace(req.kiosk.company_id, employeeId);
  return res.json({ success: true, message: 'Face enrollment removed' });
});

const getKioskAttendanceLogs = asyncHandler(async (req, res) => {
  const data = await listKioskAttendanceLogs(
    req.kiosk.company_id,
    req.kiosk.branch_id,
    {
      dateFrom: req.query.date_from,
      dateTo: req.query.date_to,
      employeeId: req.query.employee_id,
    }
  );
  return res.json({ success: true, data });
});

module.exports = {
  activateKiosk,
  getKioskStatus,
  getKioskPreferences,
  updateKioskPreferencesHandler,
  kioskFaceRecognize,
  kioskFacePunch,
  listKioskEmployees,
  enrollKioskEmployeeFace,
  removeKioskEmployeeFace,
  getKioskAttendanceLogs,
};
