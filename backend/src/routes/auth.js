const express = require('express');
const { register, login, me, changePassword } = require('../controllers/authController');
const { authenticate, requireRole } = require('../middleware/auth');
const { authLimiter } = require('../middleware/security');

const router = express.Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.get('/me', authenticate, me);
router.post('/change-password', authenticate, requireRole(['admin', 'hr']), changePassword);

module.exports = router;
