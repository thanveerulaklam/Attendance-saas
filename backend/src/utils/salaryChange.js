/**
 * Pure helpers for basic-salary increases and decreases.
 * Amounts are rounded to paise (2 decimal places).
 */

function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(2));
}

/**
 * Resolve the next basic salary from either an exact new amount or a signed change.
 * @returns {{ previousSalary: number, newSalary: number, changeAmount: number } | { error: string, code: string }}
 */
function resolveNewSalary({ previousSalary, newSalary, changeAmount } = {}) {
  const previous = roundMoney(previousSalary);
  if (previous == null) {
    return { error: 'Current basic salary is invalid.', code: 'invalid' };
  }

  const hasNew = newSalary != null && newSalary !== '';
  const hasChange = changeAmount != null && changeAmount !== '';

  if (hasNew && hasChange) {
    return {
      error: 'Enter either a new salary or a change amount, not both.',
      code: 'both',
    };
  }
  if (!hasNew && !hasChange) {
    return {
      error: 'Enter a new salary or a change amount.',
      code: 'missing',
    };
  }

  let next;
  if (hasNew) {
    next = roundMoney(newSalary);
    if (next == null) {
      return { error: 'New salary must be a number.', code: 'invalid' };
    }
  } else {
    const delta = roundMoney(changeAmount);
    if (delta == null || delta === 0) {
      return { error: 'Change amount must be a non-zero number.', code: 'invalid' };
    }
    next = roundMoney(previous + delta);
  }

  if (!(next > 0)) {
    return { error: 'Salary must stay greater than zero.', code: 'non_positive' };
  }
  if (next === previous) {
    return {
      error: 'New salary is the same as the current basic salary.',
      code: 'unchanged',
    };
  }

  return {
    previousSalary: previous,
    newSalary: next,
    changeAmount: roundMoney(next - previous),
  };
}

module.exports = {
  roundMoney,
  resolveNewSalary,
};
