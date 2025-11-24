export class HttpError extends Error {
  constructor(message, { status = 500, code = "INTERNAL_SERVER_ERROR", details } = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends HttpError {
  constructor(message, details) {
    super(message, { status: 400, code: "VALIDATION_ERROR", details });
    this.name = "ValidationError";
  }
}

export class RateLimitError extends HttpError {
  constructor(message, retryAt) {
    super(message, { status: 429, code: "RATE_LIMITED", details: retryAt ? { retryAt } : undefined });
    this.name = "RateLimitError";
    this.retryAt = retryAt;
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Unauthorized") {
    super(message, { status: 401, code: "UNAUTHORIZED" });
    this.name = "UnauthorizedError";
  }
}
