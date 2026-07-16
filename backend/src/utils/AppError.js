/**
 * Custom error class for consistent API error handling.
 * @param {string} message
 * @param {number} statusCode
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = { AppError };
