require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcrypt');
const { pool } = require('../src/config/database');

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Basic clean-up for idempotent local seeding (safe for dev only)
    await client.query('DELETE FROM payroll_records');
    await client.query('DELETE FROM attendance_logs');
    await client.query('DELETE FROM shifts');
    await client.query('DELETE FROM employees');
    await client.query('DELETE FROM users');
    await client.query('DELETE FROM devices');
    await client.query('DELETE FROM companies');

    const companyResult = await client.query(
      `INSERT INTO companies (name, email, phone, address)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['Demo Company', 'admin@demo-company.com', '+1-555-0000', 'Demo address']
    );
    const companyId = companyResult.rows[0].id;

    const adminPasswordHash = await bcrypt.hash('Admin@123', 10);

    const userResult = await client.query(
      `INSERT INTO users (company_id, name, email, password, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [companyId, 'Demo Admin', 'admin@demo-company.com', adminPasswordHash, 'admin']
    );
    const adminUserId = userResult.rows[0].id;

    const employeeResult = await client.query(
      `INSERT INTO employees (
          company_id, employee_code, name, department, designation,
          basic_salary, join_date, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        companyId,
        'EMP-001',
        'John Doe',
        'Engineering',
        'Software Engineer',
        50000,
        new Date().toISOString().slice(0, 10),
        'active',
      ]
    );
    const employeeId = employeeResult.rows[0].id;

    const shiftResult = await client.query(
      `INSERT INTO shifts (company_id, shift_name, start_time, end_time, grace_minutes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [companyId, 'General Shift', '09:00', '18:00', 15]
    );
    const shiftId = shiftResult.rows[0].id;

    // Demo device for push mode
    const deviceApiKey = 'demo-device-api-key-123';
    const deviceResult = await client.query(
      `INSERT INTO devices (company_id, name, api_key)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [companyId, 'Demo biometric device', deviceApiKey]
    );
    const deviceId = deviceResult.rows[0].id;

    // Example attendance logs for today (in/out)
    await client.query(
      `INSERT INTO attendance_logs (company_id, employee_id, punch_time, punch_type, device_id)
       VALUES
         ($1, $2, NOW() - INTERVAL '8 hours', 'in', $3),
         ($1, $2, NOW(), 'out', $3)`,
      [companyId, employeeId, `DEVICE-${deviceId}`]
    );

    // Example payroll record for current month
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const year = now.getUTCFullYear();

    await client.query(
      `INSERT INTO payroll_records (
          company_id, employee_id, month, year,
          total_days, present_days, overtime_hours,
          gross_salary, deductions, salary_advance, net_salary
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        companyId,
        employeeId,
        month,
        year,
        30,
        28,
        5,
        50000,
        2000,
        0,
        48000,
      ]
    );

    await client.query('COMMIT');

    console.log('Seed completed.');
    console.log('Company ID:', companyId);
    console.log('Admin user email: admin@demo-company.com');
    console.log('Admin password: Admin@123');
    console.log('Employee ID:', employeeId, 'Shift ID:', shiftId);
    console.log('Demo device API key (x-device-key):', deviceApiKey);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();

