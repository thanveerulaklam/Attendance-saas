const employeeService = require('../services/employeeService');
const auditService = require('../services/auditService');

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
  const { page, limit, search } = req.query || {};

  const result = await employeeService.getEmployees(
    companyId,
    {
      page,
      limit,
      search,
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
  getEmployeeById,
  updateEmployee,
  deactivateEmployee,
  deleteEmployee,
};

