const express = require('express');
const {
  createEmployee,
  getEmployees,
  getEmployeeById,
  updateEmployee,
  deactivateEmployee,
} = require('../controllers/employeeController');
const {
  authenticate,
  requireRole,
  enforceCompanyFromToken,
} = require('../middleware/auth');

const router = express.Router();

// All employee routes require authenticated admin or HR
const withEmployeeAuth = [
  authenticate,
  requireRole(['admin', 'hr']),
  enforceCompanyFromToken,
];

// POST /api/employees
router.post('/', withEmployeeAuth, createEmployee);

// GET /api/employees
router.get('/', withEmployeeAuth, getEmployees);

// GET /api/employees/:id
router.get('/:id', withEmployeeAuth, getEmployeeById);

// PUT /api/employees/:id
router.put('/:id', withEmployeeAuth, updateEmployee);

// PATCH /api/employees/:id/deactivate
router.patch('/:id/deactivate', withEmployeeAuth, deactivateEmployee);

module.exports = router;

