import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

test("config rejects production as a default application environment", () => {
  assert.throws(
    () => loadConfig({ M1_APP_ENV: "production" }),
    /M1_APP_ENV must be one of local, test, or ci/
  );
});

test("config rejects migration_owner for application runtime URLs", () => {
  assert.throws(
    () =>
      loadConfig({
        M1_APP_ENV: "local",
        M1_DATABASE_READONLY_URL: "postgresql://migration_owner@127.0.0.1:5432/m1_dev"
      }),
    /must not use migration_owner/
  );
});

test("config enforces role-specific database URLs", () => {
  assert.throws(
    () =>
      loadConfig({
        M1_APP_ENV: "local",
        M1_DATABASE_READONLY_URL: "postgresql://application_rw@127.0.0.1:5432/m1_dev"
      }),
    /must use application_ro/
  );
});

test("config accepts local development role boundaries", () => {
  const config = loadConfig({
    M1_APP_ENV: "local",
    M1_HTTP_PORT: "3100",
    M1_DATABASE_URL: "postgresql://application_rw@127.0.0.1:5432/m1_dev",
    M1_DATABASE_READONLY_URL: "postgresql://application_ro@127.0.0.1:5432/m1_dev",
    M1_DATABASE_BACKGROUND_URL: "postgresql://background_worker@127.0.0.1:5432/m1_dev"
  });

  assert.equal(config.appEnv, "local");
  assert.equal(config.port, 3100);
});
