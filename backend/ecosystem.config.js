/**
 * PM2 ecosystem config for production.
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 save && pm2 startup  # persist across reboots
 */
module.exports = {
  apps: [
    {
      name: 'attendance-api',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
