const express = require('express');
const { create, list, updateStatus } = require('../controllers/demoEnquiryController');
const { authenticate, requireRole, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/', create);
router.get('/', [authenticate, requireRole(['admin']), requireSuperAdmin], list);
router.patch('/:id/status', [authenticate, requireRole(['admin']), requireSuperAdmin], updateStatus);

module.exports = router;

