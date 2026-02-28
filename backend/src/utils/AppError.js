/**
 * Custom error class for consistent API error handling.
 * @param {string} message
 * @param {number} statusCode
 */
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = { AppError };
