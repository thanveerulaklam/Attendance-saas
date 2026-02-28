const express = require('express');
const { getStatus } = require('../controllers/onboardingController');
const {
  authenticate,
  requireRole,
  enforceCompanyFromToken,
} = require('../middleware/auth');

const router = express.Router();

const withOnboardingAuth = [
  authenticate,
  requireRole(['admin', 'hr']),
  enforceCompanyFromToken,
];

// GET /api/onboarding/status
router.get('/status', withOnboardingAuth, getStatus);

module.exports = router;

