const express = require('express');
const { list, upsert } = require('../controllers/advanceController');
const {
  authenticate,
  requireRole,
  enforceCompanyFromToken,
  attachBranchScopes,
  requireHrBranchForMutation,
} = require('../middleware/auth');

const router = express.Router();

const withAuth = [
  authenticate,
  requireRole(['admin', 'hr']),
  enforceCompanyFromToken,
  attachBranchScopes,
];

router.get('/', withAuth, list);
router.post('/', withAuth, requireHrBranchForMutation, upsert);

module.exports = router;

