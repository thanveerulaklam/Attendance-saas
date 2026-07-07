const {
  listAssignments,
  assignShiftBulk,
  getEmployeeAssignmentHistory,
  getCurrentAssignment,
  listEffectiveShiftAssignments,
} = require('../services/shiftAssignmentService');
const {
  listRotationGroups,
  createRotationGroup,
  updateRotationGroupMembers,
  importRotationGroupMembersFromAssignments,
  deleteRotationGroup,
  buildRotationPreview,
  rotateGroupNow,
  processDueRotations,
  syncRotationGroupAssignments,
} = require('../services/shiftRotationService');
const { assertShiftRotationEnabled } = require('../services/shiftRotationPolicyService');

async function getAssignments(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'companyId required' });
    }
    await assertShiftRotationEnabled(companyId);
    const { employee_id, page, limit } = req.query || {};
    const result = await listAssignments(companyId, {
      employeeId: employee_id ? Number(employee_id) : undefined,
      page,
      limit,
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function postAssignment(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'companyId required' });
    }
    const body = req.body || {};
    const result = await assignShiftBulk(companyId, {
      employeeIds: body.employee_ids || body.employeeIds,
      shiftId: body.shift_id || body.shiftId,
      effectiveFrom: body.effective_from || body.effectiveFrom,
      notes: body.notes,
      createdBy: req.user?.id,
    });
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getEffectiveShifts(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'companyId required' });
    }
    await assertShiftRotationEnabled(companyId);
    const { as_of, shift_id } = req.query || {};
    const result = await listEffectiveShiftAssignments(companyId, as_of, shift_id);
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getEmployeeHistory(req, res, next) {
  try {
    const companyId = req.companyId;
    const employeeId = Number(req.params.employeeId);
    if (!companyId || !Number.isInteger(employeeId)) {
      return res.status(400).json({ success: false, message: 'Invalid request' });
    }
    await assertShiftRotationEnabled(companyId);
    const data = await getEmployeeAssignmentHistory(companyId, employeeId);
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getEmployeeCurrent(req, res, next) {
  try {
    const companyId = req.companyId;
    const employeeId = Number(req.params.employeeId);
    if (!companyId || !Number.isInteger(employeeId)) {
      return res.status(400).json({ success: false, message: 'Invalid request' });
    }
    await assertShiftRotationEnabled(companyId);
    const data = await getCurrentAssignment(companyId, employeeId);
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getGroups(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'companyId required' });
    }
    await assertShiftRotationEnabled(companyId);
    await processDueRotations(companyId);
    const data = await listRotationGroups(companyId);
    const enriched = data.map((g) => ({
      ...g,
      preview: buildRotationPreview(g, g.members),
    }));
    return res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
}

async function postGroup(req, res, next) {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, message: 'companyId required' });
    }
    const created = await createRotationGroup(companyId, req.body || {});
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
}

async function putGroupMembers(req, res, next) {
  try {
    const companyId = req.companyId;
    const groupId = Number(req.params.id);
    if (!companyId || !Number.isInteger(groupId)) {
      return res.status(400).json({ success: false, message: 'Invalid request' });
    }
    const updated = await updateRotationGroupMembers(companyId, groupId, req.body?.members || []);
    return res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

async function postImportMembers(req, res, next) {
  try {
    const companyId = req.companyId;
    const groupId = Number(req.params.id);
    if (!companyId || !Number.isInteger(groupId)) {
      return res.status(400).json({ success: false, message: 'Invalid request' });
    }
    const body = req.body || {};
    const result = await importRotationGroupMembersFromAssignments(companyId, groupId, {
      asOfDate: body.as_of || body.asOf,
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function postSyncAssignments(req, res, next) {
  try {
    const companyId = req.companyId;
    const groupId = Number(req.params.id);
    if (!companyId || !Number.isInteger(groupId)) {
      return res.status(400).json({ success: false, message: 'Invalid request' });
    }
    const body = req.body || {};
    const result = await syncRotationGroupAssignments(companyId, groupId, {
      effectiveFrom: body.effective_from || body.effectiveFrom,
      createdBy: req.user?.id,
    });
    const groups = await listRotationGroups(companyId);
    const group = groups.find((g) => g.id === groupId);
    return res.json({
      success: true,
      data: {
        ...result,
        group: group
          ? { ...group, preview: buildRotationPreview(group, group.members) }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function deleteGroup(req, res, next) {
  try {
    const companyId = req.companyId;
    const groupId = Number(req.params.id);
    if (!companyId || !Number.isInteger(groupId)) {
      return res.status(400).json({ success: false, message: 'Invalid request' });
    }
    await deleteRotationGroup(companyId, groupId);
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function postRotateNow(req, res, next) {
  try {
    const companyId = req.companyId;
    const groupId = Number(req.params.id);
    if (!companyId || !Number.isInteger(groupId)) {
      return res.status(400).json({ success: false, message: 'Invalid request' });
    }
    const result = await rotateGroupNow(companyId, groupId, {
      effectiveFrom: req.body?.effective_from,
      createdBy: req.user?.id,
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAssignments,
  postAssignment,
  getEffectiveShifts,
  getEmployeeHistory,
  getEmployeeCurrent,
  getGroups,
  postGroup,
  putGroupMembers,
  postImportMembers,
  postSyncAssignments,
  deleteGroup,
  postRotateNow,
};
