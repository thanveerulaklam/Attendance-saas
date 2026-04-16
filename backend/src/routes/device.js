const express = require('express');
const {
  getDevices,
  createDeviceHandler,
  updateDeviceHandler,
  toggleDeviceActiveHandler,
  regenerateApiKeyHandler,
  regenerateCloudTokenHandler,
  pushLogs,
  deviceWebhook,
  devicePing,
} = require('../controllers/deviceController');
const {
  authenticate,
  requireRole,
  enforceCompanyFromToken,
  attachBranchScopes,
  requireHrBranchForMutation,
} = require('../middleware/auth');
const { devicePushLimiter } = require('../middleware/security');

const router = express.Router();

const withDeviceAuth = [
  authenticate,
  requireRole(['admin', 'hr']),
  enforceCompanyFromToken,
  attachBranchScopes,
];

// Admin/HR device management
router.get('/', withDeviceAuth, getDevices);
router.post('/', withDeviceAuth, requireHrBranchForMutation, createDeviceHandler);
router.put('/:id', withDeviceAuth, requireHrBranchForMutation, updateDeviceHandler);
router.patch('/:id/activate', withDeviceAuth, requireHrBranchForMutation, toggleDeviceActiveHandler);
router.patch('/:id/deactivate', withDeviceAuth, requireHrBranchForMutation, toggleDeviceActiveHandler);
router.post('/:id/regenerate-key', withDeviceAuth, requireHrBranchForMutation, regenerateApiKeyHandler);
router.post('/:id/regenerate-cloud-token', withDeviceAuth, requireHrBranchForMutation, regenerateCloudTokenHandler);

// Connector (on-site agent) push
router.post('/push', devicePushLimiter, pushLogs);

// Direct Cloud Push: device sends punches to cloud (webhook + ping for device health)
router.post('/webhook', devicePushLimiter, deviceWebhook);
router.get('/ping', devicePing);

module.exports = router;

