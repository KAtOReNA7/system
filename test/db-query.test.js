import assert from "node:assert/strict";
import test from "node:test";
import { withDatabaseClient } from "../src/db/query.js";

test("withDatabaseClient maps unavailable database errors to database_unavailable", async () => {
  await assert.rejects(
    () =>
      withDatabaseClient(
        "postgresql://application_ro:secret@127.0.0.1:1/m1_dev",
        "application_ro",
        "m1_test",
        async () => {
          throw new Error("should not be called");
        },
        {
          poolFactory: () => ({
            connect: async () => {
              throw new Error("connect ECONNREFUSED 127.0.0.1:1");
            },
            end: async () => {}
          })
        }
      ),
    (error) => {
      assert.equal(error.code, "database_unavailable");
      assert.equal(error.statusCode, 503);
      assert.equal(error.message.includes("127.0.0.1"), false);
      return true;
    }
  );
});
