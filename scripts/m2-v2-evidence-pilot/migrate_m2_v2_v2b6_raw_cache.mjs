#!/usr/bin/env node
import { resolve } from "node:path";

import { migrateV2B6RawCache } from "../../src/domain/m2V2EvidencePilot/v2b6RawCacheMigration.js";

try {
  const root = resolve(process.argv[2] ?? process.cwd());
  const result = migrateV2B6RawCache(root);
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    legacyEntryCount: result.legacyEntryCount,
    currentSafeEntryCount: result.currentSafeEntryCount,
    legacyMutableCacheCountAfter: result.legacyMutableCacheCountAfter,
    rawResponseCurrentCacheCountAfter: result.rawResponseCurrentCacheCountAfter,
    providerRequestDelta: result.providerRequestDelta,
    quarantineReadOnly: result.quarantineReadOnly === true,
  })}\n`);
} catch (error) {
  const code = String(error?.message ?? "v2b6_raw_cache_migration_failed")
    .replace(/[^A-Za-z0-9_.:-]/gu, "_").slice(0, 200);
  process.stderr.write(`${JSON.stringify({ status: "failed", code, providerRequestDelta: 0 })}\n`);
  process.exitCode = 1;
}
