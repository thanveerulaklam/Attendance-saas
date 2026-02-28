const { AppError } = require('../utils/AppError');

const STATUS_VALUES = ['active', 'inactive'];

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

  ensureNoErrors(errors);

  return {
    name: payload.name.trim(),
    employee_code: payload.employee_code.trim(),
    basic_salary: Number(payload.basic_salary),
    join_date: new Date(payload.join_date),
    status: payload.status || 'active',
  };
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

  ensureNoErrors(errors);

  return clean;
};

module.exports = {
  validateCreateEmployee,
  validateUpdateEmployee,
};

