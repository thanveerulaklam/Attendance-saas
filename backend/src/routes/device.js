const express = require('express');
const {
  getDevices,
  createDeviceHandler,
  updateDeviceHandler,
  toggleDeviceActiveHandler,
  regenerateApiKeyHandler,
  pushLogs,
  deviceWebhook,
  devicePing,
} = require('../controllers/deviceController');
const { authenticate, requireRole, enforceCompanyFromToken } = require('../middleware/auth');
const { devicePushLimiter } = require('../middleware/security');

const router = express.Router();

const withDeviceAuth = [authenticate, requireRole(['admin', 'hr']), enforceCompanyFromToken];

// Admin/HR device management
router.get('/', withDeviceAuth, getDevices);
router.post('/', withDeviceAuth, createDeviceHandler);
router.put('/:id', withDeviceAuth, updateDeviceHandler);
router.patch('/:id/activate', withDeviceAuth, toggleDeviceActiveHandler);
router.patch('/:id/deactivate', withDeviceAuth, toggleDeviceActiveHandler);
router.post('/:id/regenerate-key', withDeviceAuth, regenerateApiKeyHandler);

// Connector (on-site agent) push
router.post('/push', devicePushLimiter, pushLogs);

// Direct Cloud Push: device sends punches to cloud (webhook + ping for device health)
router.post('/webhook', devicePushLimiter, deviceWebhook);
router.get('/ping', devicePing);

module.exports = router;

