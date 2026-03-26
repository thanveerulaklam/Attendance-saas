const express = require('express');
const { summary } = require('../controllers/dashboardController');
const {
  authenticate,
  requireRole,
  enforceCompanyFromToken,
  attachBranchScopes,
} = require('../middleware/auth');

const router = express.Router();

router.get(
  '/summary',
  authenticate,
  requireRole(['admin', 'hr']),
  enforceCompanyFromToken,
  attachBranchScopes,
  summary
);

module.exports = router;
