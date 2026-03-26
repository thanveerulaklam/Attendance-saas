const { AppError } = require('../utils/AppError');
const {
  findActiveDeviceByApiKey,
  createDevice,
  listDevices,
  updateDevice,
  toggleDeviceActive,
  regenerateApiKey,
  processDeviceLogs,
} = require('../services/deviceService');
const auditService = require('../services/auditService');
const { getCompanyById, isSubscriptionAllowed } = require('../services/companyService');

const branchContext = (req) => ({
  role: req.user?.role,
  allowedBranchIds: req.allowedBranchIds,
  defaultBranchId: req.defaultBranchId,
});

/**
 * GET /api/device
 * Auth: admin or hr
 */
async function getDevices(req, res, next) {
  try {
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const { page, limit } = req.query || {};
    const result = await listDevices(companyId, { page, limit }, req.allowedBranchIds);

    return res.json({
      success: true,
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/device
 * Auth: admin or hr
 * Body: { name }
 */
async function createDeviceHandler(req, res, next) {
  try {
    const companyId = req.companyId;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) is required',
      });
    }

    const device = await createDevice(
      companyId,
      {
        name: req.body?.name,
        branch_id: req.body?.branch_id,
      },
      branchContext(req)
    );

    auditService.log(companyId, req.user?.user_id, 'device.create', 'device', device.id, { name: device.name }).catch(() => {});

    return res.status(201).json({
      success: true,
      data: device,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/device/:id
 * Auth: admin or hr
 * Body: { name }
 */
async function updateDeviceHandler(req, res, next) {
  try {
    const companyId = req.companyId;
    const id = Number(req.params.id);

    if (!companyId || !id) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) and valid device id are required',
      });
    }

    const device = await updateDevice(
      companyId,
      id,
      {
        name: req.body?.name,
        branch_id: req.body?.branch_id,
      },
      branchContext(req)
    );

    auditService.log(companyId, req.user?.user_id, 'device.update', 'device', id, { name: device.name }).catch(() => {});

    return res.json({
      success: true,
      data: device,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/device/:id/activate
 * PATCH /api/device/:id/deactivate
 * Auth: admin or hr
 */
async function toggleDeviceActiveHandler(req, res, next) {
  try {
    const companyId = req.companyId;
    const id = Number(req.params.id);
    const isActive = req.path.endsWith('/activate');

    if (!companyId || !id) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) and valid device id are required',
      });
    }

    const device = await toggleDeviceActive(companyId, id, isActive, branchContext(req));

    auditService.log(companyId, req.user?.user_id, isActive ? 'device.activate' : 'device.deactivate', 'device', id, { name: device.name }).catch(() => {});

    return res.json({
      success: true,
      data: device,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/device/:id/regenerate-key
 * Auth: admin or hr
 */
async function regenerateApiKeyHandler(req, res, next) {
  try {
    const companyId = req.companyId;
    const id = Number(req.params.id);

    if (!companyId || !id) {
      return res.status(400).json({
        success: false,
        message: 'companyId (from token) and valid device id are required',
      });
    }

    const device = await regenerateApiKey(companyId, id, branchContext(req));

    auditService.log(companyId, req.user?.user_id, 'device.regenerate_key', 'device', id, { name: device.name }).catch(() => {});

    // Return full api_key so UI can show + copy; UI is responsible for masking visually.
    return res.json({
      success: true,
      data: device,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/device/push
 * Connector (on-site agent) format.
 * Headers: x-device-key: <API_KEY>  (or body.api_key as fallback)
 * Body: { logs: [{ employee_code, punch_time, punch_type, device_id? }, ...] }
 */
async function pushLogs(req, res, next) {
  const apiKey = req.headers['x-device-key'] || req.body?.api_key;

  try {
    if (!apiKey) {
      throw new AppError('Device API key is required', 401);
    }

    const { logs } = req.body || {};
    if (!Array.isArray(logs) || logs.length === 0) {
      throw new AppError('logs must be a non-empty array', 400);
    }

    const normalisedLogs = logs.map((log, index) => {
      const employeeCode = log.employee_code;
      const punchType = (log.punch_type || '').toLowerCase();
      if (!employeeCode || !log.punch_time || !['in', 'out'].includes(punchType)) {
        throw new AppError(`Invalid log at index ${index}`, 400);
      }
      const punchTime = new Date(log.punch_time);
      if (Number.isNaN(punchTime.getTime())) {
        throw new AppError(`Invalid punch_time at index ${index}`, 400);
      }
      return {
        employeeCode: String(employeeCode).trim(),
        punchTime,
        punchType,
        deviceId: log.device_id,
      };
    });

    const result = await processDeviceLogs(apiKey, normalisedLogs);
    return res.status(201).json({
      success: true,
      data: { inserted: result.inserted, ...(result.skipped_unknown_codes && { skipped_unknown_codes: result.skipped_unknown_codes }) },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Parse raw body for Direct Push (device webhook).
 * Supports: (1) Our JSON { logs: [...] }, (2) Single punch JSON { userId, punchTime, state }, (3) ZKTeco tab-separated lines (text/plain).
 */
function parseWebhookBody(body, contentType, rawBody) {
  const logs = [];
  const raw = rawBody || (typeof body === 'string' ? body : null);

  if (raw && typeof raw === 'string' && raw.includes('\t')) {
    const lines = raw.split('\n').map((s) => s.trim()).filter(Boolean);
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length < 3) continue;
      const userPin = String(parts[0]).trim();
      const dateStr = parts[1];
      const state = parts[2];
      const punchTime = new Date(dateStr);
      if (!userPin || Number.isNaN(punchTime.getTime())) continue;
      const punchType = state === '1' ? 'out' : 'in';
      logs.push({ employeeCode: userPin, punchTime, punchType });
    }
    return logs;
  }

  const data = typeof body === 'object' && body !== null ? body : (raw ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : {});
  if (Array.isArray(data.logs) && data.logs.length > 0) {
    data.logs.forEach((log) => {
      const punchTime = new Date(log.punch_time || log.punchTime || log.attTime || log.timestamp);
      if (Number.isNaN(punchTime.getTime())) return;
      const code = String(log.employee_code || log.employeeCode || log.userId || log.user_id || '').trim();
      let punchType = (log.punch_type || log.punchType || log.type || '').toLowerCase();
      if (punchType !== 'in' && punchType !== 'out') {
        const state = log.state ?? log.verify_state;
        punchType = state === 1 || state === '1' ? 'out' : 'in';
      }
      if (code) logs.push({ employeeCode: code, punchTime, punchType });
    });
    return logs;
  }

  const code = String(data.userId ?? data.user_id ?? data.employee_code ?? '').trim();
  const punchTime = new Date(data.punchTime ?? data.punch_time ?? data.attTime ?? data.timestamp ?? Date.now());
  let punchType = (data.punch_type ?? data.punchType ?? data.type ?? '').toLowerCase();
  if (punchType !== 'in' && punchType !== 'out') {
    const state = data.state ?? data.verify_state;
    punchType = state === 1 || state === '1' ? 'out' : 'in';
  }
  if (code && !Number.isNaN(punchTime.getTime())) {
    logs.push({ employeeCode: code, punchTime, punchType });
  }
  return logs;
}

/**
 * POST /api/device/webhook
 * Direct Cloud Push: device sends punches to your cloud URL.
 * API key: header x-device-key (primary) or Authorization: Bearer <API_KEY>.
 * Body: JSON (our format or vendor single-punch) or ZKTeco tab-separated text.
 */
async function deviceWebhook(req, res, next) {
  const headerKey = req.headers['x-device-key'];
  const authHeader = req.headers.authorization;
  const bearerKey = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;
  const apiKey = headerKey || bearerKey;

  try {
    if (!apiKey) {
      throw new AppError('Device API key is required (use x-device-key header or Authorization: Bearer <API_KEY>)', 401);
    }

    const contentType = req.headers['content-type'] || '';
    const rawBody = typeof req.body === 'string' ? req.body : undefined;
    const logs = parseWebhookBody(req.body, contentType, rawBody);

    if (!logs || logs.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid punch data in body' });
    }

    const result = await processDeviceLogs(apiKey, logs);
    return res.status(201).json({
      success: true,
      data: { inserted: result.inserted, ...(result.skipped_unknown_codes && { skipped_unknown_codes: result.skipped_unknown_codes }) },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/device/ping
 * Device connectivity check (e.g. ZKTeco getrequest). Respond with OK.
 */
function devicePing(req, res) {
  res.set('Content-Type', 'text/plain').status(200).send('OK');
}

module.exports = {
  getDevices,
  createDeviceHandler,
  updateDeviceHandler,
  toggleDeviceActiveHandler,
  regenerateApiKeyHandler,
  pushLogs,
  deviceWebhook,
  devicePing,
};

