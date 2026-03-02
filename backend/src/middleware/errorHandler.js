/**
 * Global error handler middleware.
 * Sends consistent JSON error responses and logs server errors.
 * Uses res.end with stringified JSON so the client always gets valid JSON.
 */
function errorHandler(err, _req, res, _next) {
  if (res.headersSent) {
    return;
  }

  const status = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  if (status >= 500) {
    console.error('Server error:', err);
  }

  const body = {
    success: false,
    message: process.env.NODE_ENV === 'production' && status >= 500
      ? 'Internal server error'
      : message,
    ...(process.env.NODE_ENV !== 'production' && err.stack && { stack: err.stack }),
  };

  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

module.exports = { errorHandler };
