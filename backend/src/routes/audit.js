const express = require('express');
const { list } = require('../controllers/auditController');
const { authenticate, requireRole, enforceCompanyFromToken } = require('../middleware/auth');

const router = express.Router();

// Admin only for audit viewer (sensitive activity log)
router.get('/', authenticate, requireRole(['admin']), enforceCompanyFromToken, list);

module.exports = router;
