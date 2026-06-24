const express = require('express');
const { authenticate, requireRole, enforceCompanyFromToken } = require('../middleware/auth');

const router = express.Router();

// Employee self-service API (reserved for mobile / employee portal).
router.get(
  '/ping',
  authenticate,
  requireRole(['employee']),
  enforceCompanyFromToken,
  (req, res) => {
    res.json({
      success: true,
      data: {
        user_id: req.user.user_id,
        employee_id: req.user.employee_id || null,
        company_id: req.companyId,
      },
    });
  }
);

module.exports = router;
