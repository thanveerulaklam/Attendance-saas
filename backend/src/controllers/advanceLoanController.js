const service = require('../services/advanceLoanService');
const auditService = require('../services/auditService');

async function listLoans(req, res, next) {
  try {
    const companyId = req.companyId;
    const data = await service.getCompanyLoans(companyId, req.query || {});
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function createLoan(req, res, next) {
  try {
    const companyId = req.companyId;
    const body = req.body || {};
    const data = body.allow_multiple_loans ? await service.addLoanToEmployee(companyId, body) : await service.createAdvanceLoan(companyId, body);

    auditService.log(companyId, req.user?.user_id, 'advance_loan.create', 'employee_advance_loan', data.id, {
      employee_id: data.employee_id,
      loan_amount: data.loan_amount,
    }).catch(() => {});

    return res.status(201).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getEmployeeLoans(req, res, next) {
  try {
    const companyId = req.companyId;
    const employeeId = Number(req.params.employeeId);
    const data = await service.getEmployeeLoans(companyId, employeeId);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getMonthly(req, res, next) {
  try {
    const companyId = req.companyId;
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    const data = await service.getMonthlyRepayments(companyId, year, month);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function waive(req, res, next) {
  try {
    const companyId = req.companyId;
    const loanId = Number(req.params.loanId);
    const reason = req.body?.reason || null;
    const data = await service.waiveLoan(companyId, loanId, reason);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const companyId = req.companyId;
    const loanId = Number(req.params.loanId);
    const data = await service.getLoanById(companyId, loanId);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function updateRepayment(req, res, next) {
  try {
    const companyId = req.companyId;
    const repaymentId = Number(req.params.repaymentId);
    const data = await service.updateRepayment(companyId, repaymentId, req.body || {});
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function skip(req, res, next) {
  try {
    const companyId = req.companyId;
    const repaymentId = Number(req.params.repaymentId);
    const reason = req.body?.reason || null;
    const data = await service.skipRepayment(companyId, repaymentId, reason);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listLoans,
  createLoan,
  getEmployeeLoans,
  getMonthly,
  waive,
  getOne,
  updateRepayment,
  skip,
};
