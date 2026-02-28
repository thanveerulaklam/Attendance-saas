const { pool } = require('../config/database');

function buildSteps({
  isCompanyProfileComplete,
  hasShift,
  hasEmployee,
  hasDevice,
  hasDeviceSync,
  hasPayroll,
}) {
  const steps = [
    { key: 'company', label: 'Add company details', completed: Boolean(isCompanyProfileComplete) },
    { key: 'shift', label: 'Create shift', completed: Boolean(hasShift) },
    { key: 'employee', label: 'Add first employee', completed: Boolean(hasEmployee) },
    { key: 'device', label: 'Register device', completed: Boolean(hasDevice) },
    { key: 'device_sync', label: 'Verify device sync', completed: Boolean(hasDeviceSync) },
    { key: 'payroll', label: 'Generate first payroll', completed: Boolean(hasPayroll) },
  ];

  const totalSteps = steps.length;
  const completedCount = steps.filter((s) => s.completed).length;
  const progressPercentage = totalSteps === 0 ? 0 : Math.round((completedCount / totalSteps) * 100);

  return {
    steps,
    progressPercentage,
    isCompleted: completedCount === totalSteps && totalSteps > 0,
  };
}

async function getOnboardingStatus(companyId) {
  if (!companyId) {
    throw new Error('companyId is required for onboarding status');
  }

  const client = await pool.connect();

  try {
    const queries = await Promise.all([
      // Company profile completeness
      client.query(
        `SELECT
           name,
           phone,
           address,
           onboarding_completed_at
         FROM companies
         WHERE id = $1`,
        [companyId]
      ),

      // Shifts
      client.query(
        `SELECT COUNT(*) AS count
         FROM shifts
         WHERE company_id = $1`,
        [companyId]
      ),

      // Employees
      client.query(
        `SELECT COUNT(*) AS count
         FROM employees
         WHERE company_id = $1`,
        [companyId]
      ),

      // Devices
      client.query(
        `SELECT
           COUNT(*) AS total_count,
           COUNT(*) FILTER (WHERE last_seen_at IS NOT NULL) AS synced_count
         FROM devices
         WHERE company_id = $1`,
        [companyId]
      ),

      // Payroll records
      client.query(
        `SELECT COUNT(*) AS count
         FROM payroll_records
         WHERE company_id = $1`,
        [companyId]
      ),
    ]);

    const companyRow = queries[0].rows[0] || {};
    const shiftsCount = Number(queries[1].rows[0]?.count || 0);
    const employeesCount = Number(queries[2].rows[0]?.count || 0);
    const devicesRow = queries[3].rows[0] || {};
    const devicesCount = Number(devicesRow.total_count || 0);
    const syncedDevicesCount = Number(devicesRow.synced_count || 0);
    const payrollCount = Number(queries[4].rows[0]?.count || 0);

    const isCompanyProfileComplete =
      Boolean(companyRow?.name) &&
      Boolean(companyRow?.phone && String(companyRow.phone).trim() !== '') &&
      Boolean(companyRow?.address && String(companyRow.address).trim() !== '');

    const hasShift = shiftsCount > 0;
    const hasEmployee = employeesCount > 0;
    const hasDevice = devicesCount > 0;
    const hasDeviceSync = syncedDevicesCount > 0;
    const hasPayroll = payrollCount > 0;

    const result = buildSteps({
      isCompanyProfileComplete,
      hasShift,
      hasEmployee,
      hasDevice,
      hasDeviceSync,
      hasPayroll,
    });

    // If everything is complete and we haven't yet recorded completion, set it.
    if (result.isCompleted && !companyRow.onboarding_completed_at) {
      await client.query(
        `UPDATE companies
         SET onboarding_completed_at = NOW()
         WHERE id = $1 AND onboarding_completed_at IS NULL`,
        [companyId]
      );
    }

    return result;
  } finally {
    client.release();
  }
}

module.exports = {
  getOnboardingStatus,
};

