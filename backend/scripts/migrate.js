/* Migration runner: runs each .sql file once, tracked in schema_migrations. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/database');

/**
 * On databases created before schema_migrations existed, detect whether a file
 * still needs to run. Unlisted files (001–046) are assumed already applied.
 * Listed files are checked via schema markers (columns/tables).
 */
const APPLIED_CHECKS = {
  '047_company_onetime_amc_payment_status.sql': `EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'onetime_payment_status'
  )`,
  '048_shifts_full_day_hours.sql': `EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shifts' AND column_name = 'full_day_hours'
  )`,
  '049_tharagai_company_policies.sql': `EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'hours_based_shifts_only'
  )`,
  '050_companies_shifts_compact_ui.sql': `EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'shifts_compact_ui'
  )`,
  '051_employees_pf_amount.sql': `EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'pf_amount'
  )`,
  '052_devices_cloud_token.sql': `EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'devices' AND column_name = 'cloud_token'
  )`,
  '053_devices_adms_sn.sql': `EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'devices' AND column_name = 'adms_sn'
  )`,
  '054_company_whatsapp_auto.sql': `EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'whatsapp_auto_enabled'
  )`,
  '055_company_whatsapp_send_time.sql': `EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'whatsapp_send_time'
  )`,
  '056_companies_enable_shift_rotation.sql': `EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'enable_shift_rotation'
  )`,
  '057_employee_shift_assignments.sql': `EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'employee_shift_assignments'
  )`,
  '058_shift_rotation_groups.sql': `EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'shift_rotation_groups'
  )`,
  '059_company_payment_ledger.sql': `EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'company_payment_ledger'
  )`,
  '060_demo_enquiry_status.sql': `EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'demo_enquiries' AND column_name = 'status'
  )`,
  '061_demo_enquiry_crm_fields.sql': `EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'demo_enquiries' AND column_name = 'converted_company_id'
  )`,
};

async function hasExistingSchema(client) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'companies'
     ) AS exists`
  );
  return result.rows[0]?.exists === true;
}

async function shouldExecuteMigration(client, file, existingSchema) {
  if (!existingSchema) {
    return true;
  }
  const checkSql = APPLIED_CHECKS[file];
  if (!checkSql) {
    return false;
  }
  const result = await client.query(`SELECT ${checkSql} AS applied`);
  return result.rows[0]?.applied !== true;
}

async function runMigrations() {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const existingSchema = await hasExistingSchema(client);
    if (existingSchema) {
      console.log('Existing database detected; only new or pending migrations will execute.');
    }

    let ran = 0;
    let baselined = 0;

    for (const file of files) {
      const recorded = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file]
      );
      if (recorded.rowCount > 0) {
        console.log(`Skipping (already recorded): ${file}`);
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      const execute = await shouldExecuteMigration(client, file, existingSchema);

      await client.query('BEGIN');
      try {
        if (execute) {
          console.log(`Running migration: ${file}`);
          await client.query(sql);
          ran += 1;
        } else {
          console.log(`Baseline (schema already has changes): ${file}`);
          baselined += 1;
        }
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    console.log(`Migrations complete. Executed: ${ran}, baselined: ${baselined}, total files: ${files.length}.`);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
