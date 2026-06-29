const express = require('express');
const {
  getAssignments,
  postAssignment,
  getEffectiveShifts,
  getEmployeeHistory,
  getEmployeeCurrent,
  getGroups,
  postGroup,
  putGroupMembers,
  deleteGroup,
  postRotateNow,
} = require('../controllers/shiftRotationController');
const { authenticate, requireRole, enforceCompanyFromToken } = require('../middleware/auth');

const router = express.Router();
const auth = [authenticate, requireRole(['admin', 'hr']), enforceCompanyFromToken];

router.get('/assignments', auth, getAssignments);
router.post('/assignments', auth, postAssignment);
router.get('/assignments/effective-shifts', auth, getEffectiveShifts);
router.get('/assignments/employee/:employeeId', auth, getEmployeeHistory);
router.get('/assignments/employee/:employeeId/current', auth, getEmployeeCurrent);

router.get('/rotation-groups', auth, getGroups);
router.post('/rotation-groups', auth, postGroup);
router.put('/rotation-groups/:id/members', auth, putGroupMembers);
router.delete('/rotation-groups/:id', auth, deleteGroup);
router.post('/rotation-groups/:id/rotate', auth, postRotateNow);

module.exports = router;
