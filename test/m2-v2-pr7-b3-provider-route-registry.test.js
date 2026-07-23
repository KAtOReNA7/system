import assert from "node:assert/strict";
import test from "node:test";

import { verifyB3ProviderRouteClosure } from "./helpers/m2V2Pr7B3ProviderSecondary.js";

test("B3 provider route registry has exact classified closure over every lowest sink", () => {
  const result = verifyB3ProviderRouteClosure();
  assert.equal(result.valid, true, result.issues.join(","));
  assert.equal(result.lowestSinkCount, 6);
  assert.equal(result.discoveredTransportCallsiteCount, 6);
  assert.equal(result.routeCount, result.classifiedRouteCount);
  assert.equal(result.legacyActiveRouteCount, 0);
});
