const { AppError } = require('../utils/AppError');

const STATUS_VALUES = ['active', 'inactive'];
const PAYROLL_FREQUENCY_VALUES = ['monthly', 'weekly'];

const isValidDate = (value) => {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
};

const ensureNoErrors = (errors) => {
  if (Object.keys(errors).length > 0) {
    throw new AppError('Validation failed', 400, errors);
  }
};

const validateCreateEmployee = (payload = {}) => {
  const errors = {};

  if (payload.name == null || payload.name === '') {
    errors.name = 'Name is required.';
  } else if (typeof payload.name !== 'string') {
    errors.name = 'Name must be a string.';
  } else if (payload.name.trim().length < 2) {
    errors.name = 'Name must be at least 2 characters.';
  }

  if (payload.employee_code == null || payload.employee_code === '') {
    errors.employee_code = 'Employee code is required.';
  } else if (typeof payload.employee_code !== 'string') {
    errors.employee_code = 'Employee code must be a string.';
  }

  if (payload.basic_salary == null || payload.basic_salary === '') {
    errors.basic_salary = 'Basic salary is required.';
  } else if (Number.isNaN(Number(payload.basic_salary))) {
    errors.basic_salary = 'Basic salary must be a number.';
  } else if (Number(payload.basic_salary) <= 0) {
    errors.basic_salary = 'Basic salary must be a positive number.';
  }

  if (payload.join_date == null || payload.join_date === '') {
    errors.join_date = 'Join date is required.';
  } else if (!isValidDate(payload.join_date)) {
    errors.join_date = 'Join date must be a valid date.';
  }

  if (payload.status != null && payload.status !== '') {
    if (typeof payload.status !== 'string') {
      errors.status = 'Status must be a string.';
    } else if (!STATUS_VALUES.includes(payload.status)) {
      errors.status = `Status must be one of: ${STATUS_VALUES.join(', ')}.`;
    }
  }

  // Default to monthly if not provided
  const payrollFrequencyRaw =
    payload.payroll_frequency == null || payload.payroll_frequency === ''
      ? 'monthly'
      : payload.payroll_frequency;
  const payrollFrequency = String(payrollFrequencyRaw).toLowerCase();
  if (!PAYROLL_FREQUENCY_VALUES.includes(payrollFrequency)) {
    errors.payroll_frequency = `payroll_frequency must be one of: ${PAYROLL_FREQUENCY_VALUES.join(', ')}`;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'shift_id')) {
    if (payload.shift_id == null || payload.shift_id === '') {
      // optional: allow null/empty
    } else {
      const sid = Number(payload.shift_id);
      if (Number.isNaN(sid) || sid < 1) {
        errors.shift_id = 'Shift must be a valid positive id.';
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'daily_travel_allowance')) {
    const v = payload.daily_travel_allowance;
    if (v == null || v === '') {
      // optional: treat as 0
    } else if (Number.isNaN(Number(v)) || Number(v) < 0) {
      errors.daily_travel_allowance = 'Daily travel allowance must be a non-negative number.';
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'esi_amount')) {
    const v = payload.esi_amount;
    if (v == null || v === '') {
      // optional: treat as 0
    } else if (Number.isNaN(Number(v)) || Number(v) < 0) {
      errors.esi_amount = 'ESI amount must be a non-negative number.';
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'department')) {
    if (payload.department == null || payload.department === '') {
      // optional: store as NULL
    } else if (typeof payload.department !== 'string') {
      errors.department = 'Department must be a string.';
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'phone_number')) {
    if (payload.phone_number == null || payload.phone_number === '') {
      // optional: store as NULL
    } else if (typeof payload.phone_number !== 'string') {
      errors.phone_number = 'Phone number must be a string.';
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'aadhar_number')) {
    if (payload.aadhar_number == null || payload.aadhar_number === '') {
      // optional: store as NULL
    } else if (typeof payload.aadhar_number !== 'string') {
      errors.aadhar_number = 'Aadhaar number must be a string.';
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'esi_number')) {
    if (payload.esi_number == null || payload.esi_number === '') {
      // optional: store as NULL
    } else if (typeof payload.esi_number !== 'string') {
      errors.esi_number = 'ESI number must be a string.';
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'branch_id')) {
    if (payload.branch_id == null || payload.branch_id === '') {
      // optional; resolved server-side for admin/HR
    } else {
      const bid = Number(payload.branch_id);
      if (Number.isNaN(bid) || bid < 1) {
        errors.branch_id = 'branch_id must be a valid positive id.';
      }
    }
  }

  ensureNoErrors(errors);

  const result = {
    name: payload.name.trim(),
    employee_code: payload.employee_code.trim(),
    basic_salary: Number(payload.basic_salary),
    join_date: new Date(payload.join_date),
    status: payload.status || 'active',
    payroll_frequency: payrollFrequency,
  };
  if (Object.prototype.hasOwnProperty.call(payload, 'shift_id')) {
    result.shift_id =
      payload.shift_id == null || payload.shift_id === ''
        ? null
        : Number(payload.shift_id);
  }
  result.daily_travel_allowance = 0;
  if (Object.prototype.hasOwnProperty.call(payload, 'daily_travel_allowance')) {
    const v = payload.daily_travel_allowance;
    result.daily_travel_allowance = v == null || v === '' ? 0 : Number(v);
  }
  result.esi_amount = 0;
  if (Object.prototype.hasOwnProperty.call(payload, 'esi_amount')) {
    const v = payload.esi_amount;
    result.esi_amount = v == null || v === '' ? 0 : Number(v);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'department')) {
    result.department =
      payload.department == null || payload.department === ''
        ? null
        : payload.department.trim();
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'phone_number')) {
    result.phone_number =
      payload.phone_number == null || payload.phone_number === ''
        ? null
        : payload.phone_number.trim();
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'aadhar_number')) {
    result.aadhar_number =
      payload.aadhar_number == null || payload.aadhar_number === ''
        ? null
        : payload.aadhar_number.trim();
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'esi_number')) {
    result.esi_number =
      payload.esi_number == null || payload.esi_number === ''
        ? null
        : payload.esi_number.trim();
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'branch_id')) {
    result.branch_id =
      payload.branch_id == null || payload.branch_id === ''
        ? null
        : Number(payload.branch_id);
  }

  return result;
};

const validateUpdateEmployee = (payload = {}) => {
  const errors = {};
  const clean = {};

  if (Object.prototype.hasOwnProperty.call(payload, 'name')) {
    if (payload.name == null || payload.name === '') {
      errors.name = 'Name cannot be empty.';
    } else if (typeof payload.name !== 'string') {
      errors.name = 'Name must be a string.';
    } else if (payload.name.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters.';
    } else {
      clean.name = payload.name.trim();
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'employee_code')) {
    if (payload.employee_code == null || payload.employee_code === '') {
      errors.employee_code = 'Employee code cannot be empty.';
    } else if (typeof payload.employee_code !== 'string') {
      errors.employee_code = 'Employee code must be a string.';
    } else {
      clean.employee_code = payload.employee_code.trim();
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'basic_salary')) {
    if (payload.basic_salary == null || payload.basic_salary === '') {
      errors.basic_salary = 'Basic salary cannot be empty.';
    } else if (Number.isNaN(Number(payload.basic_salary))) {
      errors.basic_salary = 'Basic salary must be a number.';
    } else if (Number(payload.basic_salary) <= 0) {
      errors.basic_salary = 'Basic salary must be a positive number.';
    } else {
      clean.basic_salary = Number(payload.basic_salary);
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'join_date')) {
    if (payload.join_date == null || payload.join_date === '') {
      errors.join_date = 'Join date cannot be empty.';
    } else if (!isValidDate(payload.join_date)) {
      errors.join_date = 'Join date must be a valid date.';
    } else {
      clean.join_date = new Date(payload.join_date);
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
    if (payload.status == null || payload.status === '') {
      errors.status = 'Status cannot be empty.';
    } else if (typeof payload.status !== 'string') {
      errors.status = 'Status must be a string.';
    } else if (!STATUS_VALUES.includes(payload.status)) {
      errors.status = `Status must be one of: ${STATUS_VALUES.join(', ')}.`;
    } else {
      clean.status = payload.status;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'payroll_frequency')) {
    const raw = payload.payroll_frequency;
    const pf = raw == null || raw === '' ? 'monthly' : String(raw).toLowerCase();
    if (!PAYROLL_FREQUENCY_VALUES.includes(pf)) {
      errors.payroll_frequency = `payroll_frequency must be one of: ${PAYROLL_FREQUENCY_VALUES.join(', ')}`;
    } else {
      clean.payroll_frequency = pf;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'shift_id')) {
    if (payload.shift_id == null || payload.shift_id === '') {
      clean.shift_id = null;
    } else {
      const sid = Number(payload.shift_id);
      if (Number.isNaN(sid) || sid < 1) {
        errors.shift_id = 'Shift must be a valid positive id.';
      } else {
        clean.shift_id = sid;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'daily_travel_allowance')) {
    const v = payload.daily_travel_allowance;
    if (v == null || v === '') {
      clean.daily_travel_allowance = 0;
    } else if (Number.isNaN(Number(v)) || Number(v) < 0) {
      errors.daily_travel_allowance = 'Daily travel allowance must be a non-negative number.';
    } else {
      clean.daily_travel_allowance = Number(v);
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'esi_amount')) {
    const v = payload.esi_amount;
    if (v == null || v === '') {
      clean.esi_amount = 0;
    } else if (Number.isNaN(Number(v)) || Number(v) < 0) {
      errors.esi_amount = 'ESI amount must be a non-negative number.';
    } else {
      clean.esi_amount = Number(v);
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'department')) {
    if (payload.department == null || payload.department === '') {
      clean.department = null;
    } else if (typeof payload.department !== 'string') {
      errors.department = 'Department must be a string.';
    } else {
      clean.department = payload.department.trim();
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'phone_number')) {
    if (payload.phone_number == null || payload.phone_number === '') {
      clean.phone_number = null;
    } else if (typeof payload.phone_number !== 'string') {
      errors.phone_number = 'Phone number must be a string.';
    } else {
      clean.phone_number = payload.phone_number.trim();
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'aadhar_number')) {
    if (payload.aadhar_number == null || payload.aadhar_number === '') {
      clean.aadhar_number = null;
    } else if (typeof payload.aadhar_number !== 'string') {
      errors.aadhar_number = 'Aadhaar number must be a string.';
    } else {
      clean.aadhar_number = payload.aadhar_number.trim();
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'esi_number')) {
    if (payload.esi_number == null || payload.esi_number === '') {
      clean.esi_number = null;
    } else if (typeof payload.esi_number !== 'string') {
      errors.esi_number = 'ESI number must be a string.';
    } else {
      clean.esi_number = payload.esi_number.trim();
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'branch_id')) {
    if (payload.branch_id == null || payload.branch_id === '') {
      clean.branch_id = null;
    } else {
      const bid = Number(payload.branch_id);
      if (Number.isNaN(bid) || bid < 1) {
        errors.branch_id = 'branch_id must be a valid positive id.';
      } else {
        clean.branch_id = bid;
      }
    }
  }

  ensureNoErrors(errors);

  return clean;
};

module.exports = {
  validateCreateEmployee,
  validateUpdateEmployee,
};

