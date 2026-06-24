const express = require('express');
const multer = require('multer');
const {
  createEmployee,
  getEmployees,
  getDepartments,
  downloadEmployeeImportTemplate,
  bulkImportEmployees,
  getEmployeeById,
  updateEmployee,
  deactivateEmployee,
  getEmployeeAppAccess,
  provisionEmployeeAppAccess,
  revokeEmployeeAppAccess,
  deleteEmployee,
} = require('../controllers/employeeController');
const {
  authenticate,
  requireRole,
  enforceCompanyFromToken,
  attachBranchScopes,
  requireHrBranchForMutation,
} = require('../middleware/auth');

const router = express.Router();

const employeeImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function handleMulterEmployeeImport(req, res, next) {
  employeeImportUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File too large (maximum 10 MB).' });
      }
      return next(err);
    }
    next();
  });
}

// All employee routes require authenticated admin or HR
const withEmployeeAuth = [
  authenticate,
  requireRole(['admin', 'hr']),
  enforceCompanyFromToken,
  attachBranchScopes,
];

// Register specific paths before /:id and before POST /
router.get('/import-template', withEmployeeAuth, downloadEmployeeImportTemplate);

router.post(
  '/bulk-import',
  withEmployeeAuth,
  requireHrBranchForMutation,
  handleMulterEmployeeImport,
  bulkImportEmployees
);

// POST /api/employees
router.post('/', withEmployeeAuth, requireHrBranchForMutation, createEmployee);

// GET /api/employees
router.get('/', withEmployeeAuth, getEmployees);

// GET /api/employees/departments
router.get('/departments', withEmployeeAuth, getDepartments);

// GET /api/employees/:id
router.get('/:id/app-access', withEmployeeAuth, getEmployeeAppAccess);
router.post('/:id/app-access', withEmployeeAuth, requireHrBranchForMutation, provisionEmployeeAppAccess);
router.delete('/:id/app-access', withEmployeeAuth, requireHrBranchForMutation, revokeEmployeeAppAccess);

router.get('/:id', withEmployeeAuth, getEmployeeById);

// PUT /api/employees/:id
router.put('/:id', withEmployeeAuth, requireHrBranchForMutation, updateEmployee);

// PATCH /api/employees/:id/deactivate
router.patch('/:id/deactivate', withEmployeeAuth, requireHrBranchForMutation, deactivateEmployee);

// DELETE /api/employees/:id
router.delete('/:id', withEmployeeAuth, requireHrBranchForMutation, deleteEmployee);

module.exports = router;
