const { pool } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { addDaysIst, todayIstYmd } = require('../utils/istDate');
const { assertShiftRotationEnabled } = require('./shiftRotationPolicyService');
const { assignShiftBulk, listEffectiveShiftAssignments } = require('./shiftAssignmentService');

function addWeeksIso(dateStr, weeks) {
  return addDaysIst(dateStr, weeks * 7);
}

function slotToShiftId(group, slot) {
  if (slot === 'A') return group.shift_a_id;
  if (slot === 'B') return group.shift_b_id;
  if (slot === 'C') return group.shift_c_id;
  return null;
}

function rotateSlot(slot, hasThreeShifts) {
  if (hasThreeShifts) {
    if (slot === 'A') return 'B';
    if (slot === 'B') return 'C';
    return 'A';
  }
  return slot === 'A' ? 'B' : 'A';
}

function shiftIdToSlot(group, shiftId) {
  const sid = Number(shiftId);
  if (sid === Number(group.shift_a_id)) return 'A';
  if (sid === Number(group.shift_b_id)) return 'B';
  if (group.shift_c_id != null && sid === Number(group.shift_c_id)) return 'C';
  return null;
}

async function listRotationGroups(companyId) {
  await assertShiftRotationEnabled(companyId);
  const groupsR = await pool.query(
    `SELECT g.*,
            sa.shift_name AS shift_a_name,
            sb.shift_name AS shift_b_name,
            sc.shift_name AS shift_c_name
     FROM shift_rotation_groups g
     JOIN shifts sa ON sa.id = g.shift_a_id
     JOIN shifts sb ON sb.id = g.shift_b_id
     LEFT JOIN shifts sc ON sc.id = g.shift_c_id
     WHERE g.company_id = $1
     ORDER BY g.created_at ASC`,
    [companyId]
  );

  const membersR = await pool.query(
    `SELECT m.group_id, m.employee_id, m.slot,
            e.name AS employee_name, e.employee_code
     FROM shift_rotation_group_members m
     JOIN employees e ON e.id = m.employee_id
     JOIN shift_rotation_groups g ON g.id = m.group_id
     WHERE g.company_id = $1`,
    [companyId]
  );

  const membersByGroup = new Map();
  for (const row of membersR.rows) {
    if (!membersByGroup.has(row.group_id)) membersByGroup.set(row.group_id, []);
    membersByGroup.get(row.group_id).push(row);
  }

  return groupsR.rows.map((g) => ({
    ...g,
    members: membersByGroup.get(g.id) || [],
  }));
}

async function createRotationGroup(companyId, data) {
  await assertShiftRotationEnabled(companyId);
  const name = String(data.name || '').trim();
  const shiftAId = Number(data.shift_a_id);
  const shiftBId = Number(data.shift_b_id);
  const shiftCId = data.shift_c_id != null && data.shift_c_id !== '' ? Number(data.shift_c_id) : null;
  const intervalWeeks = Math.max(1, Number(data.interval_weeks) || 2);
  const anchorDate = String(data.anchor_date || todayIstYmd()).slice(0, 10);

  if (!name) throw new AppError('Group name is required', 400);
  if (!Number.isInteger(shiftAId) || !Number.isInteger(shiftBId)) {
    throw new AppError('shift_a_id and shift_b_id are required', 400);
  }

  const shiftCheck = await pool.query(
    `SELECT id FROM shifts WHERE company_id = $1 AND id = ANY($2::bigint[])`,
    [companyId, [shiftAId, shiftBId, shiftCId].filter(Boolean)]
  );
  const expected = shiftCId ? 3 : 2;
  if (shiftCheck.rowCount !== expected) throw new AppError('One or more shifts not found', 404);

  const nextRotationDate = addWeeksIso(anchorDate, intervalWeeks);

  const r = await pool.query(
    `INSERT INTO shift_rotation_groups
       (company_id, name, shift_a_id, shift_b_id, shift_c_id, interval_weeks, anchor_date, next_rotation_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date)
     RETURNING *`,
    [companyId, name, shiftAId, shiftBId, shiftCId, intervalWeeks, anchorDate, nextRotationDate]
  );
  return r.rows[0];
}

async function updateRotationGroupMembers(companyId, groupId, members) {
  await assertShiftRotationEnabled(companyId);
  const gid = Number(groupId);
  const groupR = await pool.query(
    `SELECT * FROM shift_rotation_groups WHERE company_id = $1 AND id = $2`,
    [companyId, gid]
  );
  if (groupR.rowCount === 0) throw new AppError('Rotation group not found', 404);
  const group = groupR.rows[0];
  const hasThree = group.shift_c_id != null;
  const allowedSlots = hasThree ? ['A', 'B', 'C'] : ['A', 'B'];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM shift_rotation_group_members WHERE group_id = $1`, [gid]);

    for (const m of members || []) {
      const eid = Number(m.employee_id);
      const slot = String(m.slot || '').toUpperCase();
      if (!Number.isInteger(eid) || !allowedSlots.includes(slot)) continue;
      const empCheck = await client.query(
        `SELECT id FROM employees WHERE company_id = $1 AND id = $2`,
        [companyId, eid]
      );
      if (empCheck.rowCount === 0) continue;
      await client.query(
        `INSERT INTO shift_rotation_group_members (group_id, employee_id, slot)
         VALUES ($1, $2, $3)`,
        [gid, eid, slot]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await syncRotationGroupAssignments(companyId, gid);
  return listRotationGroups(companyId).then((groups) => groups.find((g) => g.id === gid));
}

/**
 * Write rotation member slots to dated shift assignments + employees.shift_id for today.
 */
async function syncRotationGroupAssignments(companyId, groupId, { effectiveFrom, createdBy, notes } = {}) {
  await assertShiftRotationEnabled(companyId);
  const gid = Number(groupId);
  const groupR = await pool.query(
    `SELECT * FROM shift_rotation_groups WHERE company_id = $1 AND id = $2`,
    [companyId, gid]
  );
  if (groupR.rowCount === 0) throw new AppError('Rotation group not found', 404);
  const group = groupR.rows[0];
  const fromDate = String(effectiveFrom || todayIstYmd()).slice(0, 10);

  const membersR = await pool.query(
    `SELECT employee_id, slot FROM shift_rotation_group_members WHERE group_id = $1`,
    [gid]
  );
  if (membersR.rowCount === 0) {
    return { synced: 0, effective_from: fromDate };
  }

  const buckets = new Map();
  for (const m of membersR.rows) {
    const shiftId = slotToShiftId(group, m.slot);
    if (!shiftId) continue;
    if (!buckets.has(shiftId)) buckets.set(shiftId, []);
    buckets.get(shiftId).push(Number(m.employee_id));
  }

  let synced = 0;
  for (const [shiftId, employeeIds] of buckets) {
    await assignShiftBulk(companyId, {
      employeeIds,
      shiftId,
      effectiveFrom: fromDate,
      source: 'rotation',
      rotationGroupId: gid,
      notes: notes || `Rotation group: ${group.name}`,
      createdBy,
    });
    synced += employeeIds.length;
  }

  return { synced, effective_from: fromDate };
}

/**
 * Sync rotation group members from effective shift assignments on a date.
 * Employees on shift A/B/C in the group are added with matching slots; others are removed.
 */
async function importRotationGroupMembersFromAssignments(companyId, groupId, { asOfDate } = {}) {
  await assertShiftRotationEnabled(companyId);
  const gid = Number(groupId);
  const groupR = await pool.query(
    `SELECT * FROM shift_rotation_groups WHERE company_id = $1 AND id = $2`,
    [companyId, gid]
  );
  if (groupR.rowCount === 0) throw new AppError('Rotation group not found', 404);
  const group = groupR.rows[0];

  const asOf = String(asOfDate || todayIstYmd()).slice(0, 10);
  const { data } = await listEffectiveShiftAssignments(companyId, asOf);

  const members = [];
  for (const row of data) {
    const slot = shiftIdToSlot(group, row.shift_id);
    if (!slot) continue;
    members.push({ employee_id: row.employee_id, slot });
  }

  const updated = await updateRotationGroupMembers(companyId, gid, members);
  return {
    as_of: asOf,
    imported: members.length,
    by_slot: {
      A: members.filter((m) => m.slot === 'A').length,
      B: members.filter((m) => m.slot === 'B').length,
      C: members.filter((m) => m.slot === 'C').length,
    },
    group: updated,
  };
}

async function deleteRotationGroup(companyId, groupId) {
  await assertShiftRotationEnabled(companyId);
  const r = await pool.query(
    `DELETE FROM shift_rotation_groups WHERE company_id = $1 AND id = $2 RETURNING id`,
    [companyId, groupId]
  );
  if (r.rowCount === 0) throw new AppError('Rotation group not found', 404);
}

function buildRotationPreview(group, members) {
  const hasThree = group.shift_c_id != null;
  return (members || []).map((m) => {
    const currentShiftId = slotToShiftId(group, m.slot);
    const nextSlot = rotateSlot(m.slot, hasThree);
    const nextShiftId = slotToShiftId(group, nextSlot);
    return {
      employee_id: m.employee_id,
      employee_name: m.employee_name,
      employee_code: m.employee_code,
      current_slot: m.slot,
      next_slot: nextSlot,
      current_shift_id: currentShiftId,
      next_shift_id: nextShiftId,
    };
  });
}

async function rotateGroupNow(companyId, groupId, { effectiveFrom, createdBy } = {}) {
  await assertShiftRotationEnabled(companyId);
  const gid = Number(groupId);
  const fromDate = String(effectiveFrom || todayIstYmd()).slice(0, 10);

  const client = await pool.connect();
  try {
    const groupR = await client.query(
      `SELECT * FROM shift_rotation_groups WHERE company_id = $1 AND id = $2`,
      [companyId, gid]
    );
    if (groupR.rowCount === 0) throw new AppError('Rotation group not found', 404);
    const group = groupR.rows[0];
    const hasThree = group.shift_c_id != null;

    const membersR = await client.query(
      `SELECT m.*, e.name AS employee_name FROM shift_rotation_group_members m
       JOIN employees e ON e.id = m.employee_id
       WHERE m.group_id = $1`,
      [gid]
    );

    const byNewSlot = new Map();
    for (const m of membersR.rows) {
      const newSlot = rotateSlot(m.slot, hasThree);
      byNewSlot.set(m.employee_id, { newSlot, shiftId: slotToShiftId(group, newSlot) });
    }

    const shiftBuckets = new Map();
    for (const [eid, { shiftId }] of byNewSlot) {
      if (!shiftBuckets.has(shiftId)) shiftBuckets.set(shiftId, []);
      shiftBuckets.get(shiftId).push(eid);
    }

    for (const [shiftId, employeeIds] of shiftBuckets) {
      await assignShiftBulk(companyId, {
        employeeIds,
        shiftId,
        effectiveFrom: fromDate,
        source: 'rotation',
        rotationGroupId: gid,
        notes: `Rotation: ${group.name}`,
        createdBy,
      });
    }

    for (const m of membersR.rows) {
      const newSlot = rotateSlot(m.slot, hasThree);
      await client.query(
        `UPDATE shift_rotation_group_members SET slot = $3 WHERE group_id = $1 AND employee_id = $2`,
        [gid, m.employee_id, newSlot]
      );
    }

    const nextDate = addWeeksIso(fromDate, group.interval_weeks);
    await client.query(
      `UPDATE shift_rotation_groups SET next_rotation_date = $2::date WHERE id = $1`,
      [gid, nextDate]
    );

    return { rotated: membersR.rows.length, next_rotation_date: nextDate };
  } finally {
    client.release();
  }
}

async function processDueRotations(companyId = null, createdBy = null) {
  const params = [];
  let where = 'WHERE g.is_active = TRUE AND g.next_rotation_date <= $1::date';
  params.push(todayIstYmd());
  if (companyId) {
    params.push(companyId);
    where += ` AND g.company_id = $${params.length}`;
  }

  const dueR = await pool.query(
    `SELECT g.id, g.company_id FROM shift_rotation_groups g
     JOIN companies c ON c.id = g.company_id AND c.enable_shift_rotation = TRUE
     ${where}`,
    params
  );

  const results = [];
  for (const row of dueR.rows) {
    const result = await rotateGroupNow(row.company_id, row.id, {
      effectiveFrom: todayIstYmd(),
      createdBy,
    });
    results.push({ group_id: row.id, company_id: row.company_id, ...result });
  }
  return results;
}

module.exports = {
  listRotationGroups,
  createRotationGroup,
  updateRotationGroupMembers,
  syncRotationGroupAssignments,
  importRotationGroupMembersFromAssignments,
  deleteRotationGroup,
  buildRotationPreview,
  rotateGroupNow,
  processDueRotations,
};
