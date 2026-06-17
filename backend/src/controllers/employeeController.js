const path = require('path');
const employeeService = require('../services/employeeService');
const employeeBulkImportService = require('../services/employeeBulkImportService');
const auditService = require('../services/auditService');
const { AppError } = require('../utils/AppError');

// Simple async handler utility for controllers
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * POST /api/employees
 * Body: { name, employee_code, basic_salary, join_date, status? }
 */
const branchContext = (req) => ({
  role: req.user?.role,
  allowedBranchIds: req.allowedBranchIds,
  defaultBranchId: req.defaultBranchId,
});

const createEmployee = asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const employee = await employeeService.createEmployee(companyId, req.body || {}, branchContext(req));

  auditService.log(companyId, req.user?.user_id, 'employee.create', 'employee', employee.id, { name: employee.name }).catch(() => {});

  return res.status(201).json({
    success: true,
    data: employee,
  });
});

/**
 * GET /api/employees
 * Query: { page?, limit?, search? }
 */
const getEmployees = asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const { page, limit, search, status, branch_id: branchId, department, gender } = req.query || {};

  const result = await employeeService.getEmployees(
    companyId,
    {
      page,
      limit,
      search,
      status,
      branch_id: branchId,
      department,
      gender,
    },
    req.allowedBranchIds
  );

  return res.status(200).json({
    success: true,
    data: result,
  });
});

/**
 * GET /api/employees/departments
 */
const getDepartments = asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const departments = await employeeService.getEmployeeDepartments(companyId, req.allowedBranchIds);

  return res.status(200).json({
    success: true,
    data: departments,
  });
});

/**
 * GET /api/employees/import-template
 */
const downloadEmployeeImportTemplate = asyncHandler(async (req, res) => {
  const filePath = path.join(__dirname, '..', '..', 'templates', 'employee-import-template.xlsx');
  return res.download(filePath, 'employee-import-template.xlsx');
});

/**
 * POST /api/employees/bulk-import (multipart field "file")
 */
const bulkImportEmployees = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) {
    return res.status(400).json({
      success: false,
      message: 'No file uploaded. Use form field name "file".',
    });
  }

  const original = (req.file.originalname || '').toLowerCase();
  if (!/\.(xlsx|xls|csv)$/.test(original)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid file type. Use .xlsx, .xls, or .csv.',
    });
  }

  const companyId = req.companyId;
  let rows;
  let headerMap;
  try {
    const parsed = employeeBulkImportService.parseImportFile(req.file.buffer, {
      filename: req.file.originalname,
    });
    rows = parsed.rows;
    headerMap = parsed.headerMap;
  } catch (e) {
    if (e instanceof AppError) {
      return res.status(e.statusCode).json({ success: false, message: e.message });
    }
    throw e;
  }

  const result = await employeeBulkImportService.bulkImportEmployeesForApi(
    companyId,
    rows,
    headerMap,
    branchContext(req)
  );

  if (result.error === 'DUPLICATE_CODES_IN_SHEET') {
    return res.status(400).json({
      success: false,
      message: 'Duplicate employee codes in the file. Each code must appear only once.',
      data: { duplicates: result.duplicates },
    });
  }

  if (result.error === 'TOO_MANY_ROWS') {
    return res.status(400).json({
      success: false,
      message: `This file has too many rows (${result.rowCount}). Maximum is ${result.maxRows}.`,
    });
  }

  auditService
    .log(companyId, req.user?.user_id, 'employee.bulk_import', 'employee', null, {
      created: result.created,
      skipped: result.skipped,
      failed: result.failed?.length ?? 0,
    })
    .catch(() => {});

  return res.status(200).json({
    success: true,
    data: {
      created: result.created,
      skipped: result.skipped,
      failed: result.failed,
    },
  });
});

/**
 * GET /api/employees/:id
 */
const getEmployeeById = asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const id = Number(req.params.id);

  const employee = await employeeService.getEmployeeById(companyId, id, branchContext(req));

  return res.status(200).json({
    success: true,
    data: employee,
  });
});

/**
 * PUT /api/employees/:id
 * Body: partial employee fields to update
 */
const updateEmployee = asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const id = Number(req.params.id);

  const updated = await employeeService.updateEmployee(companyId, id, req.body || {}, branchContext(req));

  auditService.log(companyId, req.user?.user_id, 'employee.update', 'employee', id, { name: updated.name }).catch(() => {});

  return res.status(200).json({
    success: true,
    data: updated,
  });
});

/**
 * PATCH /api/employees/:id/deactivate
 */
const deactivateEmployee = asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const id = Number(req.params.id);

  const updated = await employeeService.deactivateEmployee(companyId, id, branchContext(req));

  auditService.log(companyId, req.user?.user_id, 'employee.deactivate', 'employee', id, { name: updated.name }).catch(() => {});

  return res.status(200).json({
    success: true,
    data: updated,
  });
});

/**
 * DELETE /api/employees/:id
 */
const deleteEmployee = asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const id = Number(req.params.id);

  const result = await employeeService.deleteEmployee(companyId, id, branchContext(req));

  const action = result?.action === 'deactivated' ? 'employee.deactivate' : 'employee.delete';
  auditService.log(companyId, req.user?.user_id, action, 'employee', id, { name: result?.employee?.name }).catch(() => {});

  if (result?.action === 'deactivated') {
    return res.status(200).json({
      success: true,
      message: 'Employee has linked history and was deactivated instead of deleted.',
      data: result,
    });
  }

  return res.status(204).send();
});

module.exports = {
  createEmployee,
  getEmployees,
  getDepartments,
  downloadEmployeeImportTemplate,
  bulkImportEmployees,
  getEmployeeById,
  updateEmployee,
  deactivateEmployee,
  deleteEmployee,
};

