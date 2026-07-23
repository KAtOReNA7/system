#!/usr/bin/env node
import { resolve } from "node:path";

import { writeV2B6CacheV03Candidate } from "../../src/domain/m2V2EvidencePilot/v2b6RawCacheMigration.js";

try {
  const args = process.argv.slice(2);
  const rootArg = args.find((value) => !value.startsWith("--"));
  const root = resolve(rootArg ?? process.cwd());
  const outputArg = args.find((value) => value.startsWith("--output="));
  if (!outputArg) throw new Error("v2b6_cache_v03_candidate_output_required");
  const result = writeV2B6CacheV03Candidate(root, { outputRelativePath: outputArg.slice("--output=".length) });
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    writeStatus: result.writeStatus,
    sourceCount: result.sourceCount,
    migratedCount: result.migratedCount,
    quarantinedCount: result.quarantinedCount,
    rejectedCount: result.rejectedCount,
    providerRequestDelta: result.providerRequestDelta,
    currentPromotionPerformed: result.currentPromotionPerformed,
  })}\n`);
} catch (error) {
  const code = String(error?.message ?? "v2b6_raw_cache_migration_failed")
    .replace(/[^A-Za-z0-9_.:-]/gu, "_").slice(0, 200);
  process.stderr.write(`${JSON.stringify({ status: "failed", code, providerRequestDelta: 0 })}\n`);
  process.exitCode = 1;
}
