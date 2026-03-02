const express = require('express');
const { list, upsert } = require('../controllers/advanceController');
const { authenticate, requireRole, enforceCompanyFromToken } = require('../middleware/auth');

const router = express.Router();

const withAuth = [authenticate, requireRole(['admin', 'hr']), enforceCompanyFromToken];

router.get('/', withAuth, list);
router.post('/', withAuth, upsert);

module.exports = router;

