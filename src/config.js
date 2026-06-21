const ALLOWED_APP_ENVS = new Set(["local", "test", "ci"]);

export class ConfigError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ConfigError";
    this.code = code;
  }
}

function optionalValue(value) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parsePort(raw) {
  const value = optionalValue(raw) ?? "3000";
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError("invalid_port", "M1_HTTP_PORT must be an integer from 1 to 65535");
  }
  return port;
}

function validateDatabaseUrl(rawUrl, expectedUser, variableName) {
  const value = optionalValue(rawUrl);
  if (!value) {
    return undefined;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new ConfigError("invalid_database_url", `${variableName} must be a valid database URL`);
  }

  if (!["postgresql:", "postgres:"].includes(parsed.protocol)) {
    throw new ConfigError("invalid_database_url_scheme", `${variableName} must use a PostgreSQL URL scheme`);
  }

  const username = decodeURIComponent(parsed.username || "");
  if (!username) {
    throw new ConfigError("database_role_missing", `${variableName} must include an explicit database role`);
  }

  if (username === "migration_owner") {
    throw new ConfigError("migration_owner_not_allowed", `${variableName} must not use migration_owner`);
  }

  if (username !== expectedUser) {
    throw new ConfigError("unexpected_database_role", `${variableName} must use ${expectedUser}`);
  }

  return value;
}

export function loadConfig(env = process.env) {
  const appEnv = optionalValue(env.M1_APP_ENV) ?? "local";
  if (!ALLOWED_APP_ENVS.has(appEnv)) {
    throw new ConfigError(
      "unsupported_app_environment",
      "M1_APP_ENV must be one of local, test, or ci for the current M1 development stage"
    );
  }

  return {
    service: "m1-audiobook-evaluation",
    appEnv,
    port: parsePort(env.M1_HTTP_PORT),
    database: {
      rwUrl: validateDatabaseUrl(env.M1_DATABASE_URL, "application_rw", "M1_DATABASE_URL"),
      readonlyUrl: validateDatabaseUrl(
        env.M1_DATABASE_READONLY_URL,
        "application_ro",
        "M1_DATABASE_READONLY_URL"
      ),
      backgroundUrl: validateDatabaseUrl(
        env.M1_DATABASE_BACKGROUND_URL,
        "background_worker",
        "M1_DATABASE_BACKGROUND_URL"
      )
    }
  };
}
