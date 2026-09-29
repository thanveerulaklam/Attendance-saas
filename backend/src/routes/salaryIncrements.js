const express = require('express');
const { list, history, create } = require('../controllers/salaryIncrementController');
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
router.get('/:employeeId', withAuth, history);
router.post('/', withAuth, requireHrBranchForMutation, create);

module.exports = router;
