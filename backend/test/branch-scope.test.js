const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * Lightweight checks for branch filter param indexing helpers (mirrors attendanceService pattern).
 */
function employeesBranchFilterSql(allowedBranchIds, paramIndex) {
  if (allowedBranchIds == null) {
    return { clause: '', params: [], nextIndex: paramIndex };
  }
  if (allowedBranchIds.length === 0) {
    return { clause: ' AND FALSE', params: [], nextIndex: paramIndex };
  }
  return {
    clause: ` AND branch_id = ANY($${paramIndex}::bigint[])`,
    params: [allowedBranchIds],
    nextIndex: paramIndex + 1,
  };
}

test('branch filter: admin scope adds no clause', () => {
  const r = employeesBranchFilterSql(null, 2);
  assert.equal(r.clause, '');
  assert.equal(r.params.length, 0);
  assert.equal(r.nextIndex, 2);
});

test('branch filter: empty HR list forces empty result', () => {
  const r = employeesBranchFilterSql([], 2);
  assert.equal(r.clause.trim(), 'AND FALSE');
  assert.equal(r.nextIndex, 2);
});

test('branch filter: HR list uses ANY array', () => {
  const r = employeesBranchFilterSql([1, 2], 2);
  assert.match(r.clause, /\$2::bigint\[\]/);
  assert.deepEqual(r.params, [[1, 2]]);
  assert.equal(r.nextIndex, 3);
});
