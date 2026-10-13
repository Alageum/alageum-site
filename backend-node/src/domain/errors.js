"use strict";
class AppError extends Error {
  constructor(code, message, status = 422, details = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
module.exports = { AppError };
