const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { errorHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/security');
const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');
const deviceRouter = require('./routes/device');
const payrollRouter = require('./routes/payroll');
const employeeRouter = require('./routes/employees');
const onboardingRouter = require('./routes/onboarding');
const companyRouter = require('./routes/company');
const shiftsRouter = require('./routes/shifts');
const holidaysRouter = require('./routes/holidays');
const attendanceRouter = require('./routes/attendance');
const reportsRouter = require('./routes/reports');
const auditRouter = require('./routes/audit');
const dashboardRouter = require('./routes/dashboard');
const adminRouter = require('./routes/admin');
const advancesRouter = require('./routes/advances');
const advanceLoansRouter = require('./routes/advanceLoans');
const demoEnquiriesRouter = require('./routes/demoEnquiries');

const app = express();

// Respect reverse proxy headers in production deployments (e.g. Nginx/Render/Railway),
// so req.ip and rate limits are applied to real client IPs.
app.set('trust proxy', 1);

// Security headers
app.use(helmet({ contentSecurityPolicy: false }));

// Request logging (dev only)
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Rate limiting (skip /api/health for load balancer probes)
app.use('/api/', (req, res, next) => {
  if (req.path === '/health' || req.path.startsWith('/health/')) return next();
  apiLimiter(req, res, next);
});

// CORS: explicit allowlist + optional env override; never use wildcard with credentials:true
const allowedOrigins = [
  'https://punchpay.in',
  'https://www.punchpay.in',
  'http://localhost:5173',
  'http://localhost:3000',
];

if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(process.env.CORS_ORIGIN);
}

app.use(cors({
  origin(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman, connector)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Parsing
// Allow slightly larger JSON bodies for bulk device log push; text for ZKTeco direct push
app.use(express.json({ limit: '5mb' }));
app.use(express.text({ type: ['text/plain', 'text/*'], limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// API routes
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/device', deviceRouter);
app.use('/api/payroll', payrollRouter);
app.use('/api/employees', employeeRouter);
app.use('/api/onboarding', onboardingRouter);
app.use('/api/company', companyRouter);
app.use('/api/shifts', shiftsRouter);
app.use('/api/holidays', holidaysRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/admin', adminRouter);
app.use('/api/advances', advancesRouter);
app.use('/api/advance-loans', advanceLoansRouter);
app.use('/api/demo-enquiries', demoEnquiriesRouter);

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
