const CONNECTION_STRING_PATTERN =
  /\b(?:postgresql|postgres):\/\/[^\s"'<>]+/gi;

const PASSWORD_ASSIGNMENT_PATTERN =
  /\b(password|passwd|pwd|token|secret|api[_-]?key)=([^&\s]+)/gi;

export class AppError extends Error {
  constructor(code, message, statusCode = 500) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function sanitizeError(error) {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const sanitizedMessage = rawMessage
    .replace(CONNECTION_STRING_PATTERN, "[database-url-redacted]")
    .replace(PASSWORD_ASSIGNMENT_PATTERN, "$1=[redacted]");

  return {
    code: error?.code || "database_check_failed",
    message: sanitizedMessage
  };
}

export function publicErrorBody(error, requestId) {
  const isPublic = error instanceof AppError;
  const sanitized = isPublic
    ? { code: error.code, message: error.message }
    : { code: error?.code || "internal_error", message: "Internal server error" };

  return {
    error: {
      code: sanitized.code,
      message: sanitized.message,
      requestId
    }
  };
}

export function notFound(resource = "Resource") {
  return new AppError("not_found", `${resource} not found`, 404);
}

export function badRequest(message) {
  return new AppError("bad_request", message, 400);
}

export function databaseNotConfigured(role) {
  return new AppError("database_not_configured", `${role} database connection is not configured`, 503);
}

export function databaseUnavailable(role) {
  return new AppError("database_unavailable", `${role} database is unavailable`, 503);
}
