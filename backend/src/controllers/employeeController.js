const employeeService = require('../services/employeeService');
const auditService = require('../services/auditService');

// Simple async handler utility for controllers
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * POST /api/employees
 * Body: { name, employee_code, basic_salary, join_date, status? }
 */
const createEmployee = asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const employee = await employeeService.createEmployee(companyId, req.body || {});

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

  const result = await employeeService.getEmployees(companyId, {
    page,
    limit,
    search,
  });

  return res.status(200).json({
    success: true,
    data: result,
  });
});

/**
 * GET /api/employees/:id
 */
const getEmployeeById = asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const id = Number(req.params.id);

  const employee = await employeeService.getEmployeeById(companyId, id);

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

  const updated = await employeeService.updateEmployee(companyId, id, req.body || {});

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

  const updated = await employeeService.deactivateEmployee(companyId, id);

  auditService.log(companyId, req.user?.user_id, 'employee.deactivate', 'employee', id, { name: updated.name }).catch(() => {});

  return res.status(200).json({
    success: true,
    data: updated,
  });
});

module.exports = {
  createEmployee,
  getEmployees,
  getEmployeeById,
  updateEmployee,
  deactivateEmployee,
};

