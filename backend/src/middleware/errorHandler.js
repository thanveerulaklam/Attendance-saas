/**
 * Global error handler middleware.
 * Sends consistent JSON error responses and logs server errors.
 */
function errorHandler(err, _req, res, _next) {
  const status = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  if (status >= 500) {
    console.error('Server error:', err);
  }

  res.status(status).json({
    success: false,
    message: process.env.NODE_ENV === 'production' && status >= 500
      ? 'Internal server error'
      : message,
    ...(process.env.NODE_ENV !== 'production' && err.stack && { stack: err.stack }),
  });
}

module.exports = { errorHandler };
