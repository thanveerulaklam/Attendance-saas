const employeeService = require('../services/employeeService');
const employeeAppService = require('../services/employeeAppService');
const faceEnrollmentService = require('../services/faceEnrollmentService');
const employeeBulkImportService = require('../services/employeeBulkImportService');
const { buildEmployeeImportTemplateBuffer } = require('../services/employeeImportTemplate');
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
  const buffer = await buildEmployeeImportTemplateBuffer();
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="employee-import-template.xlsx"');
  return res.send(Buffer.from(buffer));
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
 * GET /api/employees/:id/app-access
 */
const getEmployeeAppAccess = asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const id = Number(req.params.id);
  const user = await employeeAppService.getEmployeeAppAccess(companyId, id);
  return res.json({ success: true, data: user });
});

/**
 * POST /api/employees/:id/app-access
 * Body: { email, password, name? }
 */
const provisionEmployeeAppAccess = asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const id = Number(req.params.id);
  const result = await employeeAppService.provisionEmployeeAppAccess(companyId, id, req.body || {});
  auditService
    .log(companyId, req.user?.user_id, 'employee.app_access', 'employee', id, {
      email: result.user.email,
      created: result.created,
    })
    .catch(() => {});
  return res.status(result.created ? 201 : 200).json({
    success: true,
    data: result.user,
    message: result.created ? 'Employee app login created' : 'Employee app login updated',
  });
});

/**
 * DELETE /api/employees/:id/app-access
 */
const revokeEmployeeAppAccess = asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const id = Number(req.params.id);
  const removed = await employeeAppService.revokeEmployeeAppAccess(companyId, id);
  auditService
    .log(companyId, req.user?.user_id, 'employee.app_access_revoke', 'employee', id, {
      email: removed.email,
    })
    .catch(() => {});
  return res.json({ success: true, message: 'Employee app login removed' });
});

const getEmployeeFaceEnrollment = asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const id = Number(req.params.id);
  const enrollment = await faceEnrollmentService.getEnrollment(companyId, id);
  return res.json({ success: true, data: enrollment });
});

const enrollEmployeeFace = asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const id = Number(req.params.id);
  if (!req.file?.buffer) {
    throw new AppError('Photo file is required', 400);
  }
  const result = await faceEnrollmentService.enrollEmployeeFace(
    companyId,
    id,
    req.file.buffer,
    req.user?.user_id ?? null
  );
  auditService
    .log(companyId, req.user?.user_id, 'employee.face_enroll', 'employee', id, {
      name: result.employee.name,
    })
    .catch(() => {});
  return res.status(201).json({
    success: true,
    data: result.enrollment,
    message: `Face enrolled for ${result.employee.name}`,
  });
});

const removeEmployeeFaceEnrollment = asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const id = Number(req.params.id);
  await faceEnrollmentService.removeEmployeeFace(companyId, id);
  auditService
    .log(companyId, req.user?.user_id, 'employee.face_enroll_remove', 'employee', id, {})
    .catch(() => {});
  return res.json({ success: true, message: 'Face enrollment removed' });
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
  getEmployeeAppAccess,
  provisionEmployeeAppAccess,
  revokeEmployeeAppAccess,
  getEmployeeFaceEnrollment,
  enrollEmployeeFace,
  removeEmployeeFaceEnrollment,
  deleteEmployee,
};

