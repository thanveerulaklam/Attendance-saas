const service = require('../services/salaryPaymentService');
const auditService = require('../services/auditService');

async function list(req, res, next) {
  try {
    const companyId = req.companyId;
    const data = await service.listPayments(companyId, {
      ...req.query,
      allowedBranchIds: req.allowedBranchIds,
    });
    return res.json({ success: true, ...data });
  } catch (err) {
    return next(err);
  }
}

async function employeeStatement(req, res, next) {
  try {
    const companyId = req.companyId;
    const employeeId = Number(req.params.employeeId);
    const { from_date: fromDate, to_date: toDate } = req.query || {};
    const data = await service.getEmployeeStatement(companyId, employeeId, fromDate, toDate);
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function payrollSummary(req, res, next) {
  try {
    const companyId = req.companyId;
    const payrollId = Number(req.params.payrollId);
    const data = await service.getPayrollPaymentSummary(companyId, { payrollRecordId: payrollId });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function weeklySummary(req, res, next) {
  try {
    const companyId = req.companyId;
    const weeklyPayrollId = Number(req.params.weeklyPayrollId);
    const data = await service.getPayrollPaymentSummary(companyId, { weeklyPayrollRecordId: weeklyPayrollId });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function outstanding(req, res, next) {
  try {
    const companyId = req.companyId;
    const data = await service.listOutstandingPayrolls(companyId, {
      ...req.query,
      allowedBranchIds: req.allowedBranchIds,
    });
    return res.json({ success: true, ...data });
  } catch (err) {
    return next(err);
  }
}

async function monthlySummary(req, res, next) {
  try {
    const companyId = req.companyId;
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    const data = await service.getMonthlyPaymentSummary(
      companyId,
      year,
      month,
      req.allowedBranchIds
    );
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function create(req, res, next) {
  try {
    const companyId = req.companyId;
    const body = req.body || {};
    const data = await service.recordPayment({
      companyId,
      employeeId: body.employee_id,
      payrollRecordId: body.payroll_record_id || null,
      weeklyPayrollRecordId: body.weekly_payroll_record_id || null,
      amount: body.amount,
      paymentDate: body.payment_date,
      paymentMode: body.payment_mode,
      referenceNumber: body.reference_number,
      notes: body.notes,
      userId: req.user?.user_id,
    });

    auditService.log(companyId, req.user?.user_id, 'salary_payment.create', 'employee_salary_payment', data.id, {
      employee_id: data.employee_id,
      amount: data.amount,
      payment_mode: data.payment_mode,
      payroll_record_id: data.payroll_record_id,
      weekly_payroll_record_id: data.weekly_payroll_record_id,
    }).catch(() => {});

    return res.status(201).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function update(req, res, next) {
  try {
    const companyId = req.companyId;
    const paymentId = Number(req.params.id);
    const body = req.body || {};
    const data = await service.updatePayment(companyId, paymentId, body, req.user?.user_id);

    auditService.log(companyId, req.user?.user_id, 'salary_payment.update', 'employee_salary_payment', paymentId, {
      amount: data.amount,
      payment_mode: data.payment_mode,
    }).catch(() => {});

    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function remove(req, res, next) {
  try {
    const companyId = req.companyId;
    const paymentId = Number(req.params.id);
    const row = await service.voidPayment(companyId, paymentId);

    auditService.log(companyId, req.user?.user_id, 'salary_payment.void', 'employee_salary_payment', paymentId, {
      employee_id: row.employee_id,
      amount: row.amount,
    }).catch(() => {});

    return res.json({ success: true, data: { id: paymentId, voided: true } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  list,
  employeeStatement,
  payrollSummary,
  weeklySummary,
  outstanding,
  monthlySummary,
  create,
  update,
  remove,
};
