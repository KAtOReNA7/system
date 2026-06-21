import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNoDataDirectoryInput,
  assertSmokeEnvironment,
  parseDatabaseUrl
} from "../tools/dev-smoke/smoke-safety.mjs";

test("smoke safety accepts only local database hosts", () => {
  assert.throws(
    () =>
      parseDatabaseUrl(
        "postgresql://application_ro@example.invalid:5432/m1_dev",
        "M1_DATABASE_READONLY_URL",
        "application_ro"
      ),
    /must point to localhost/
  );
});

test("smoke safety enforces expected database role", () => {
  assert.throws(
    () =>
      parseDatabaseUrl(
        "postgresql://migration_owner@127.0.0.1:5432/m1_dev",
        "M1_DATABASE_READONLY_URL",
        "application_ro"
      ),
    /must use application_ro/
  );
});

test("smoke safety rejects staging and production environments", () => {
  assert.throws(
    () => assertSmokeEnvironment({ M1_APP_ENV: "production" }),
    /not allowed/
  );
  assert.throws(
    () => assertSmokeEnvironment({ M1_APP_ENV: "staging" }),
    /not allowed/
  );
});

test("smoke safety rejects M1 env values that point to data directories", () => {
  const previous = process.env.M1_FAKE_INPUT_PATH;
  process.env.M1_FAKE_INPUT_PATH = "D:/example/data/real-bills";
  try {
    assert.throws(() => assertNoDataDirectoryInput(), /must not point to a data directory/);
  } finally {
    if (previous === undefined) {
      delete process.env.M1_FAKE_INPUT_PATH;
    } else {
      process.env.M1_FAKE_INPUT_PATH = previous;
    }
  }
});
