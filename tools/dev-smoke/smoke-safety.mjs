const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const DISALLOWED_ENVIRONMENTS = new Set(["staging", "production", "prod"]);

export function parseDatabaseUrl(value, variableName, expectedUser) {
  if (!value || typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${variableName} is required for database smoke tests`);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL URL`);
  }

  if (!["postgresql:", "postgres:"].includes(parsed.protocol)) {
    throw new Error(`${variableName} must use a PostgreSQL URL`);
  }

  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(`${variableName} must point to localhost, 127.0.0.1, or ::1`);
  }

  const username = decodeURIComponent(parsed.username || "");
  if (username !== expectedUser) {
    throw new Error(`${variableName} must use ${expectedUser}`);
  }

  const databaseName = parsed.pathname.replace(/^\//, "");
  if (!databaseName) {
    throw new Error(`${variableName} must include a database name`);
  }
  if (/prod|production|staging|正式/i.test(databaseName)) {
    throw new Error(`${variableName} database name is not allowed for smoke tests`);
  }

  return {
    value,
    host: parsed.hostname,
    databaseName,
    username
  };
}

export function assertSmokeEnvironment(env = process.env) {
  const appEnv = (env.M1_APP_ENV || "local").trim().toLowerCase();
  if (DISALLOWED_ENVIRONMENTS.has(appEnv)) {
    throw new Error(`M1_APP_ENV=${appEnv} is not allowed for smoke tests`);
  }
}

export function assertNoDataDirectoryInput() {
  for (const key of Object.keys(process.env)) {
    if (!key.startsWith("M1_")) {
      continue;
    }
    const value = process.env[key] || "";
    if (/[\\/]data[\\/]/i.test(value)) {
      throw new Error(`${key} must not point to a data directory`);
    }
  }
}

export function sanitizeForReport(value) {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = new URL(value);
    parsed.username = parsed.username ? "[role]" : "";
    parsed.password = parsed.password ? "[redacted]" : "";
    return parsed.toString();
  } catch {
    return "[invalid-url-redacted]";
  }
}
