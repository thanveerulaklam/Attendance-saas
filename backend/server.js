require('dotenv').config();
const { validateEnv } = require('./src/config/validateEnv');
const app = require('./src/app');
const { testConnection } = require('./src/config/database');

validateEnv();

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    const dbOk = await testConnection();
    if (!dbOk) {
      console.error('Database connection failed. Exiting.');
      process.exit(1);
    }
    console.log('Database connected.');
  } catch (err) {
    console.error('Startup error:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start();
