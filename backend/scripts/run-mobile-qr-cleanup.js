#!/usr/bin/env node
/**
 * Manually purge expired mobile QR nonces (same logic as the nightly cron job).
 *
 * Usage: node scripts/run-mobile-qr-cleanup.js
 */
require('dotenv').config();
const { runMobileQrCleanupJob } = require('../src/jobs/mobileQrCleanupJob');

runMobileQrCleanupJob()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
