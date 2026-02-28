const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'attendance_saas',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

// In development, log query duration and truncated text
if (process.env.NODE_ENV === 'development') {
  const originalQuery = pool.query.bind(pool);
  pool.query = function (config, values, callback) {
    const start = Date.now();
    const text = typeof config === 'string' ? config : config?.text || '';
    const promise = originalQuery(config, values, callback);
    const onDone = () => {
      const ms = Date.now() - start;
      console.log(`[db] ${ms}ms ${text.replace(/\s+/g, ' ').slice(0, 80)}${text.length > 80 ? '…' : ''}`);
    };
    if (typeof callback === 'function') {
      const orig = callback;
      return originalQuery(config, values, (err, res) => {
        onDone();
        orig(err, res);
      });
    }
    return promise.then((res) => {
      onDone();
      return res;
    });
  };
}

/**
 * Test database connectivity
 * @returns {Promise<boolean>}
 */
async function testConnection() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    return true;
  } finally {
    client.release();
  }
}

module.exports = { pool, testConnection };
