const CONNECTION_STRING_PATTERN =
  /\b(?:postgresql|postgres):\/\/[^\s"'<>]+/gi;

const PASSWORD_ASSIGNMENT_PATTERN =
  /\b(password|passwd|pwd|token|secret|api[_-]?key)=([^&\s]+)/gi;

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

export function publicErrorBody(error) {
  const sanitized = sanitizeError(error);
  return {
    status: "error",
    error: {
      code: sanitized.code,
      message: sanitized.message
    }
  };
}
