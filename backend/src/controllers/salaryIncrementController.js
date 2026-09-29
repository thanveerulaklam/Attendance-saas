const salaryIncrementService = require('../services/salaryIncrementService');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const branchContext = (req) => ({
  role: req.user?.role,
  allowedBranchIds: req.allowedBranchIds,
  defaultBranchId: req.defaultBranchId,
  userId: req.user?.user_id ?? null,
});

const list = asyncHandler(async (req, res) => {
  const result = await salaryIncrementService.listEmployees(
    req.companyId,
    req.query || {},
    req.allowedBranchIds
  );
  return res.status(200).json({ success: true, data: result });
});

const history = asyncHandler(async (req, res) => {
  const result = await salaryIncrementService.getHistory(
    req.companyId,
    req.params.employeeId,
    branchContext(req)
  );
  return res.status(200).json({ success: true, data: result });
});

const create = asyncHandler(async (req, res) => {
  const result = await salaryIncrementService.applySalaryChange(
    req.companyId,
    req.body || {},
    branchContext(req)
  );
  return res.status(201).json({ success: true, data: result });
});

module.exports = {
  list,
  history,
  create,
};
