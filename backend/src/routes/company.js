const express = require('express');
const { getCurrentCompany, updateCurrentCompany, updateSubscriptionHandler } = require('../controllers/companyController');
const { authenticate, requireRole, enforceCompanyFromToken } = require('../middleware/auth');

const router = express.Router();

const withCompanyAuth = [authenticate, requireRole(['admin', 'hr']), enforceCompanyFromToken];
const adminOnly = [authenticate, requireRole(['admin']), enforceCompanyFromToken];

// GET /api/company
router.get('/', withCompanyAuth, getCurrentCompany);

// PUT /api/company
router.put('/', withCompanyAuth, updateCurrentCompany);

// POST /api/company/subscription (admin only)
router.post('/subscription', adminOnly, updateSubscriptionHandler);

module.exports = router;

