const express = require('express');
const { create, list } = require('../controllers/demoEnquiryController');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/', create);
router.get('/', [authenticate, requireRole(['admin'])], list);

module.exports = router;

