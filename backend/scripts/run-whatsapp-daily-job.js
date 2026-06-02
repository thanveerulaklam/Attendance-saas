/**
 * Run the daily WhatsApp attendance job once (all auto-enabled companies due today).
 * Usage: npm run whatsapp:daily
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('../src/config/database');
const { runDailyWhatsappStatsJob } = require('../src/jobs/dailyWhatsappStatsJob');

async function main() {
  try {
    const summary = await runDailyWhatsappStatsJob();
    console.log(JSON.stringify(summary, null, 2));
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
