import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  assertLocalDatabaseTarget,
  compareDistribution,
  summarizeReconciliation
} from "../../src/domain/oldProductEvaluation/realDataDbImportPlan.js";

const { Client } = pg;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUTPUT_DIR = join(ROOT, "docs", "analysis", "m2-real-data");
const REPORT_JSON = join(OUTPUT_DIR, "M2-local-db-import-reconciliation-summary-v0.1.json");
const REPORT_MD = join(OUTPUT_DIR, "M2-local-db-import-reconciliation-summary-v0.1.md");
const MIGRATION_DIR = join(ROOT, "db", "migrations");
const CANDIDATE_VERSION = "m2-realdata-dev-candidate-b-v0.1";
const IMPORT_ACTOR = "codex_m2_local_db_import";
const LOCAL_ALGORITHM_VERSION_NO = 700000;
const DEFAULT_POSTGRES_IMAGE = "postgres:16-bookworm";

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    clear: argv.includes("--clear"),
    skipDocker: argv.includes("--skip-docker")
  };
}

function readDotEnv(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing local env file: ${path}. Run tools/dev-db/New-M1LocalEnvFile.ps1 first.`);
  }
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const [key, ...rest] = trimmed.split("=");
    values[key] = rest.join("=");
  }
  return values;
}

function requireValue(values, name) {
  const value = values[name];
  if (!value || String(value).trim().length === 0) {
    throw new Error(`${name} is required in .env.local`);
  }
  return String(value);
}

function sqlIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function localConfig(values) {
  const host = requireValue(values, "M1_LOCAL_DB_HOST");
  const port = Number(requireValue(values, "M1_LOCAL_DEV_DB_PORT"));
  const databaseName = requireValue(values, "M1_LOCAL_DEV_DB_NAME");
  const environmentName = values.M1_LOCAL_DEV_ENVIRONMENT_NAME || "m1-local-dev";
  const guard = assertLocalDatabaseTarget({ host, databaseName, environmentName });
  if (!guard.localOnly) {
    throw new Error(`Refusing non-local or formal database target: ${JSON.stringify(guard)}`);
  }
  return {
    host,
    port,
    databaseName,
    environmentName,
    adminUser: requireValue(values, "M1_POSTGRES_ADMIN_USER"),
    adminPassword: requireValue(values, "M1_POSTGRES_ADMIN_PASSWORD"),
    migrationPassword: requireValue(values, "M1_MIGRATION_OWNER_PASSWORD"),
    rwPassword: requireValue(values, "M1_APPLICATION_RW_PASSWORD"),
    roPassword: requireValue(values, "M1_APPLICATION_RO_PASSWORD"),
    workerPassword: requireValue(values, "M1_BACKGROUND_WORKER_PASSWORD"),
    backupPassword: requireValue(values, "M1_BACKUP_OPERATOR_PASSWORD")
  };
}

function runDocker(args, options = {}) {
  try {
    return execFileSync("docker", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: options.stdio ?? "pipe",
      timeout: options.timeoutMs ?? 120000
    }).trim();
  } catch (error) {
    const message = error.stderr?.toString().trim() || error.stdout?.toString().trim() || error.message;
    throw new Error(`Docker command failed: ${message}`);
  }
}

function ensureDockerPostgres(config, { skipDocker }) {
  if (skipDocker) {
    return { dockerUsed: false, container: config.environmentName, note: "docker_skipped" };
  }
  const postgresImage = process.env.M2_LOCAL_POSTGRES_IMAGE || DEFAULT_POSTGRES_IMAGE;
  runDocker(["--version"], { timeoutMs: 30000 });
  const existing = runDocker([
    "ps",
    "-a",
    "--filter",
    `name=^/${config.environmentName}$`,
    "--format",
    "{{.ID}}"
  ]);
  const volumeName = `${config.environmentName}-pgdata`;
  if (!existing) {
    runDocker(
      [
        "run",
        "-d",
        "--name",
        config.environmentName,
        "-e",
        `POSTGRES_PASSWORD=${config.adminPassword}`,
        "-e",
        `POSTGRES_USER=${config.adminUser}`,
        "-p",
        `${config.host}:${config.port}:5432`,
        "-v",
        `${volumeName}:/var/lib/postgresql/data`,
        postgresImage
      ],
      { timeoutMs: 180000 }
    );
  } else {
    const running = runDocker(["inspect", "-f", "{{.State.Running}}", config.environmentName]);
    if (running !== "true") {
      runDocker(["start", config.environmentName], { timeoutMs: 60000 });
    }
  }

  let ready = false;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      runDocker(["exec", config.environmentName, "pg_isready", "-U", config.adminUser, "-d", "postgres"], {
        timeoutMs: 10000
      });
      ready = true;
      break;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    }
  }
  if (!ready) {
    throw new Error(`PostgreSQL container did not become ready: ${config.environmentName}`);
  }
  return { dockerUsed: true, container: config.environmentName, image: postgresImage };
}

function adminClient(config, database = "postgres") {
  return new Client({
    host: config.host,
    port: config.port,
    database,
    user: config.adminUser,
    password: config.adminPassword,
    connectionTimeoutMillis: 5000
  });
}

function migrationClient(config) {
  return new Client({
    host: config.host,
    port: config.port,
    database: config.databaseName,
    user: "migration_owner",
    password: config.migrationPassword,
    connectionTimeoutMillis: 5000
  });
}

async function withClient(client, fn) {
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function ensureRolesAndDatabase(config) {
  await withClient(adminClient(config), async (client) => {
    const roles = [
      ["migration_owner", config.migrationPassword],
      ["application_rw", config.rwPassword],
      ["application_ro", config.roPassword],
      ["background_worker", config.workerPassword],
      ["backup_operator", config.backupPassword]
    ];
    for (const [role, password] of roles) {
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${sqlLiteral(role)}) THEN
            CREATE ROLE ${sqlIdentifier(role)} LOGIN PASSWORD ${sqlLiteral(password)};
          ELSE
            ALTER ROLE ${sqlIdentifier(role)} WITH LOGIN PASSWORD ${sqlLiteral(password)};
          END IF;
        END
        $$;
      `);
    }

    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      config.databaseName
    ]);
    if (exists.rowCount === 0) {
      await client.query(
        `CREATE DATABASE ${sqlIdentifier(config.databaseName)} OWNER ${sqlIdentifier("migration_owner")}`
      );
    }
    await client.query(`ALTER DATABASE ${sqlIdentifier(config.databaseName)} SET TimeZone TO 'UTC'`);
  });
}

async function ensureHistoryTable(client) {
  await client.query("SET TIME ZONE 'UTC'");
  await client.query("CREATE SCHEMA IF NOT EXISTS flyway_history AUTHORIZATION migration_owner");
  await client.query("CREATE SCHEMA IF NOT EXISTS m1 AUTHORIZATION migration_owner");
  await client.query(`
    CREATE TABLE IF NOT EXISTS flyway_history.flyway_schema_history (
      installed_rank integer NOT NULL PRIMARY KEY,
      version varchar(50),
      description varchar(200) NOT NULL,
      type varchar(20) NOT NULL,
      script varchar(1000) NOT NULL,
      checksum integer,
      installed_by varchar(100) NOT NULL,
      installed_on timestamptz NOT NULL DEFAULT now(),
      execution_time integer NOT NULL,
      success boolean NOT NULL
    )
  `);
}

function migrationVersion(fileName) {
  const match = /^V([0-9]+)_([0-9]+)__(.+)\.sql$/.exec(fileName);
  if (!match) {
    throw new Error(`Invalid migration name: ${fileName}`);
  }
  return {
    version: `${match[1]}.${match[2]}`,
    description: match[3].replaceAll("_", " "),
    script: fileName
  };
}

function checksum(text) {
  return createHash("sha256").update(text).digest().readInt32BE(0);
}

async function runMigrations(config) {
  return withClient(migrationClient(config), async (client) => {
    await ensureHistoryTable(client);
    const files = (await readdir(MIGRATION_DIR)).filter((name) => name.endsWith(".sql")).sort();
    const appliedRows = await client.query(
      "SELECT version FROM flyway_history.flyway_schema_history WHERE success"
    );
    const applied = new Set(appliedRows.rows.map((row) => row.version));
    const executed = [];

    for (const file of files) {
      const meta = migrationVersion(file);
      if (applied.has(meta.version)) {
        continue;
      }
      const sql = await readFile(join(MIGRATION_DIR, file), "utf8");
      const nextRankResult = await client.query(
        "SELECT COALESCE(MAX(installed_rank), 0) + 1 AS next_rank FROM flyway_history.flyway_schema_history"
      );
      const nextRank = Number(nextRankResult.rows[0].next_rank);
      const started = Date.now();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          `INSERT INTO flyway_history.flyway_schema_history
             (installed_rank, version, description, type, script, checksum, installed_by, execution_time, success)
           VALUES ($1, $2, $3, 'SQL', $4, $5, current_user, $6, true)`,
          [nextRank, meta.version, meta.description, meta.script, checksum(sql), Date.now() - started]
        );
        await client.query("COMMIT");
        executed.push(meta);
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration failed at ${file}: ${error.message}`);
      }
    }

    await client.query(`
      GRANT USAGE ON SCHEMA flyway_history TO application_ro, background_worker;
      GRANT SELECT ON flyway_history.flyway_schema_history TO application_ro, background_worker;
    `);

    const latest = await client.query(
      `SELECT version
         FROM flyway_history.flyway_schema_history
        WHERE success
        ORDER BY installed_rank DESC
        LIMIT 1`
    );
    return {
      migrationFiles: files.length,
      migrationsExecuted: executed.map((item) => item.version),
      latestSchemaVersion: latest.rows[0]?.version ?? null
    };
  });
}

function runPayloadBuilder() {
  const tempDeps = join(process.env.TEMP || "", "codex-system-pydeps");
  const pythonPath = [tempDeps, join(ROOT, "tools", "m2-calibration"), process.env.PYTHONPATH]
    .filter(Boolean)
    .join(";");
  const stdout = execFileSync("python", ["scripts/m2-real-data/build_candidate_b_db_import_payload.py"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PYTHONPATH: pythonPath },
    timeout: 180000
  });
  return JSON.parse(stdout);
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(ROOT, relativePath), "utf8"));
}

function money(value) {
  return Number.parseFloat(String(value ?? "0"));
}

function nonNegativeIntegerOrNull(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }
  return Math.max(0, Math.trunc(Number(value)));
}

async function clearCandidate(client) {
  const resultIds = await client.query(
    `SELECT id FROM m1.m2_evaluation_results WHERE candidate_version = $1`,
    [CANDIDATE_VERSION]
  );
  const ids = resultIds.rows.map((row) => row.id);
  if (ids.length === 0) {
    await client.query("DELETE FROM m1.m2_evaluation_algorithm_versions WHERE version_key = $1", [
      CANDIDATE_VERSION
    ]);
    return 0;
  }
  await client.query("DELETE FROM m1.m2_evaluation_review_items WHERE evaluation_result_id = ANY($1::bigint[])", [ids]);
  await client.query("DELETE FROM m1.m2_evaluation_suggestions WHERE evaluation_result_id = ANY($1::bigint[])", [ids]);
  await client.query("DELETE FROM m1.m2_evaluation_risks WHERE evaluation_result_id = ANY($1::bigint[])", [ids]);
  await client.query("DELETE FROM m1.m2_evaluation_input_snapshots WHERE evaluation_result_id = ANY($1::bigint[])", [ids]);
  await client.query("DELETE FROM m1.m2_evaluation_results WHERE id = ANY($1::bigint[])", [ids]);
  await client.query("DELETE FROM m1.m2_evaluation_algorithm_versions WHERE version_key = $1", [
    CANDIDATE_VERSION
  ]);
  return ids.length;
}

async function ensureLocalVersionRows(client, payload, reconciliation) {
  const task = await client.query(
    `INSERT INTO m1.background_task
       (task_type, logical_operation_key, idempotency_key, status, business_stage, payload, result, finished_at, created_by)
     VALUES
       ('m2_realdata_local_db_import', $1, $1, 'succeeded', 'M2',
        $2::jsonb, $3::jsonb, now(), $4)
     ON CONFLICT (task_type, idempotency_key)
     DO UPDATE SET result = EXCLUDED.result, finished_at = now(), status = 'succeeded'
     RETURNING id`,
    [
      CANDIDATE_VERSION,
      JSON.stringify({ candidateVersion: CANDIDATE_VERSION, aggregateOnly: true }),
      JSON.stringify({ status: "ok", rawRowsWritten: false }),
      IMPORT_ACTOR
    ]
  );
  const taskId = task.rows[0].id;

  const classification = await client.query(
    `INSERT INTO m1.classification_release(version_no, status, release_note, created_by)
     VALUES ($1, 'draft', 'local M2 real-data dev placeholder classification release', $2)
     ON CONFLICT (version_no)
     DO UPDATE SET release_note = EXCLUDED.release_note
     RETURNING id`,
    [LOCAL_ALGORITHM_VERSION_NO, IMPORT_ACTOR]
  );
  const tag = await client.query(
    `INSERT INTO m1.tag_release(version_no, status, release_note, created_by)
     VALUES ($1, 'draft', 'local M2 real-data dev placeholder tag release', $2)
     ON CONFLICT (version_no)
     DO UPDATE SET release_note = EXCLUDED.release_note
     RETURNING id`,
    [LOCAL_ALGORITHM_VERSION_NO, IMPORT_ACTOR]
  );

  const existingMapping = await client.query(
    "SELECT id, status FROM m1.mapping_version WHERE version_no = $1",
    [LOCAL_ALGORITHM_VERSION_NO]
  );
  const mapping =
    existingMapping.rows[0] ??
    (
      await client.query(
        `INSERT INTO m1.mapping_version
           (version_no, status, trigger_type, trigger_ref, build_task_id, projection_row_count,
            projection_total_amount, projection_checksum, validated_at, created_by)
         VALUES ($1, 'validated', 'local_realdata_dev_candidate', $2, $3, $4, $5, $6, now(), $7)
         RETURNING id, status`,
        [
          LOCAL_ALGORITHM_VERSION_NO,
          CANDIDATE_VERSION,
          taskId,
          payload.aggregate.evaluatedWorkCount,
          money(reconciliation.amountReconciliation.completeIncludedAmount),
          createHash("sha256").update(JSON.stringify(payload.aggregate)).digest("hex"),
          IMPORT_ACTOR
        ]
      )
    ).rows[0];

  const existingBasicInfo = await client.query(
    "SELECT id, status FROM m1.basic_info_version WHERE version_no = $1",
    [LOCAL_ALGORITHM_VERSION_NO]
  );
  const basicInfo =
    existingBasicInfo.rows[0] ??
    (
      await client.query(
        `INSERT INTO m1.basic_info_version
           (version_no, status, source_type, classification_release_id, tag_release_id, build_task_id,
            snapshot_work_count, snapshot_checksum, created_by)
         VALUES ($1, 'building', 'formal_basic_info', $2, $3, $4, $5, $6, $7)
         RETURNING id, status`,
        [
          LOCAL_ALGORITHM_VERSION_NO,
          classification.rows[0].id,
          tag.rows[0].id,
          taskId,
          payload.aggregate.evaluatedWorkCount,
          createHash("sha256").update(CANDIDATE_VERSION).digest("hex"),
          IMPORT_ACTOR
        ]
      )
    ).rows[0];

  const algorithm = await client.query(
    `INSERT INTO m1.m2_evaluation_algorithm_versions
       (version_key, candidate_version, parameter_version, status, is_formal, source_candidate,
        description, frozen_at, audit_metadata_json)
     VALUES ($1, $1, $2, 'frozen', false, $3, $4, now(), $5::jsonb)
     ON CONFLICT (version_key)
     DO UPDATE SET
       parameter_version = EXCLUDED.parameter_version,
       audit_metadata_json = EXCLUDED.audit_metadata_json,
       frozen_at = COALESCE(m1.m2_evaluation_algorithm_versions.frozen_at, now())
     RETURNING version_key`,
    [
      CANDIDATE_VERSION,
      payload.parameterVersion,
      payload.baselineCandidate,
      "Authorized local real-data development candidate. Not final release-approved.",
      JSON.stringify({
        schema: "m2.local_db_import.algorithm_metadata.v0.1",
        aggregate: payload.aggregate,
        sourceScale: payload.sourceScale,
        amountReconciliation: reconciliation.amountReconciliation,
        rowReconciliation: reconciliation.rowReconciliation,
        safeOutputBoundary: payload.safeOutputBoundary
      })
    ]
  );

  return {
    taskId,
    mappingVersionId: mapping.id,
    basicInfoVersionId: basicInfo.id,
    basicInfoCanWriteChildren: basicInfo.status === "building",
    algorithmVersion: algorithm.rows[0].version_key
  };
}

function reviewMetadata(work, type) {
  const allReasons =
    type === "blocking_manual_review"
      ? work.manualReviewBlockingReasons
      : work.manualReviewAdvisoryReasons;
  return {
    schema: "m2.local_review_item.audit_metadata.v0.1",
    candidateVersion: CANDIDATE_VERSION,
    workRef: work.workRef,
    allReasons,
    allowedActions: work.reviewItem?.allowedActions ?? [],
    events: [
      {
        eventType: "review_item_created",
        actor: IMPORT_ACTOR,
        at: new Date().toISOString(),
        aggregateOnly: true
      }
    ],
    rawDetailWritten: false
  };
}

async function importPayload(client, payload, reconciliation, { clear }) {
  await client.query("BEGIN");
  try {
    const clearedResults = clear ? await clearCandidate(client) : 0;
    const existing = await client.query(
      "SELECT count(*)::int AS count FROM m1.m2_evaluation_results WHERE candidate_version = $1",
      [CANDIDATE_VERSION]
    );
    if (!clear && Number(existing.rows[0].count) > 0) {
      await client.query("COMMIT");
      return {
        mode: "existing_reused",
        clearedResults,
        insertedEvaluationResults: 0,
        insertedInputSnapshots: 0,
        insertedRisks: 0,
        insertedSuggestions: 0,
        insertedReviewItems: 0
      };
    }

    const versions = await ensureLocalVersionRows(client, payload, reconciliation);
    const incompleteMonths = payload.sourceScale.excludedIncompleteMonths.map((month) => `${month}-01`);
    const counters = {
      mode: "imported",
      clearedResults,
      insertedEvaluationResults: 0,
      insertedInputSnapshots: 0,
      insertedRisks: 0,
      insertedSuggestions: 0,
      insertedReviewItems: 0
    };

    for (const work of payload.works) {
      await client.query(
        `INSERT INTO m1.standard_work(standard_work_id, identity_source, created_by)
         VALUES ($1, 'ops_confirmed', $2)
         ON CONFLICT (standard_work_id) DO NOTHING`,
        [work.workRef, IMPORT_ACTOR]
      );
      if (versions.basicInfoCanWriteChildren) {
        await client.query(
          `INSERT INTO m1.basic_info_version_work
             (basic_info_version_id, standard_work_id, standard_work_name, source_record_ref)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (basic_info_version_id, standard_work_id) DO NOTHING`,
          [
            versions.basicInfoVersionId,
            work.workRef,
            `Sanitized Work ${work.workRef}`,
            `local-realdata-dev:${CANDIDATE_VERSION}`
          ]
        );
      }

      const result = await client.query(
        `INSERT INTO m1.m2_evaluation_results
           (standard_work_id, candidate_version, algorithm_version, parameter_version, mapping_version_id,
            basic_info_version_id, cutoff_month, result_status, rating, rating_score, lifecycle,
            lifecycle_confidence, forecast_base_total, forecast_optimistic_total, forecast_pessimistic_total,
            forecast_range_lower, forecast_range_upper, risk_level, primary_suggestion,
            not_for_formal_decision, formal_evaluation_allowed, generated_at)
         VALUES
           ($1, $2, $2, $3, $4, $5, $6::date, 'current', $7, $8, $9, $10,
            $11, $12, $13, $13, $12, $14, $15, true, false, now())
         RETURNING id`,
        [
          work.workRef,
          CANDIDATE_VERSION,
          payload.parameterVersion,
          versions.mappingVersionId,
          versions.basicInfoVersionId,
          payload.cutoffMonth,
          work.rating,
          work.ratingScore,
          work.lifecycle,
          work.lifecycleConfidence,
          work.forecastBase,
          work.forecastOptimistic,
          work.forecastPessimistic,
          work.riskLevel,
          work.primarySuggestion
        ]
      );
      counters.insertedEvaluationResults += 1;
      const evaluationResultId = result.rows[0].id;

      await client.query(
        `INSERT INTO m1.m2_evaluation_input_snapshots
           (evaluation_result_id, standard_work_id, cutoff_month, latest_complete_month, income_fact_version,
            source_batch_ids, mapping_version_id, basic_info_version_id, remaining_copyright_months,
            last3_revenue, last6_revenue, last12_revenue, last24_revenue, total_historical_revenue,
            active_month_count, zero_revenue_month_count, business_form_breakdown,
            channel_concentration_summary, incomplete_months_excluded, input_hash)
         VALUES
           ($1, $2, $3::date, $4::date, $5, ARRAY[]::bigint[], $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb, $18::date[], $19)`,
        [
          evaluationResultId,
          work.workRef,
          payload.cutoffMonth,
          payload.cutoffMonth,
          "authorized_local_file_aggregate_v0.1",
          versions.mappingVersionId,
          versions.basicInfoVersionId,
          nonNegativeIntegerOrNull(work.inputSnapshot.remainingCopyrightMonths),
          work.inputSnapshot.last3Revenue,
          work.inputSnapshot.last6Revenue,
          work.inputSnapshot.last12Revenue,
          work.inputSnapshot.last24Revenue,
          work.inputSnapshot.totalHistoricalRevenue,
          work.inputSnapshot.activeMonthCount,
          work.inputSnapshot.zeroRevenueMonthCount,
          JSON.stringify(work.inputSnapshot.businessFormBreakdown),
          JSON.stringify(work.inputSnapshot.channelConcentrationSummary),
          incompleteMonths,
          work.inputSnapshot.inputHash
        ]
      );
      counters.insertedInputSnapshots += 1;

      for (const riskCode of work.riskCodes) {
        const riskType = work.manualReviewRequired
          ? "blocking"
          : work.manualReviewAdvisoryReasons.length > 0
            ? "advisory"
            : "warning";
        await client.query(
          `INSERT INTO m1.m2_evaluation_risks
             (evaluation_result_id, risk_code, severity, risk_type, is_blocking, is_advisory,
              evidence_json, mitigation_hint)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
          [
            evaluationResultId,
            riskCode,
            payload.riskSeverityMap[riskCode] ?? "low",
            riskType,
            riskType === "blocking",
            riskType === "advisory",
            JSON.stringify({
              workRef: work.workRef,
              aggregateOnly: true,
              rawDetailWritten: false
            }),
            "Review aggregate risk reason before formal release."
          ]
        );
        counters.insertedRisks += 1;
      }

      for (const [index, suggestionCode] of work.suggestionCodes.entries()) {
        await client.query(
          `INSERT INTO m1.m2_evaluation_suggestions
             (evaluation_result_id, suggestion_code, priority, reason, expected_impact,
              requires_manual_confirmation)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            evaluationResultId,
            suggestionCode,
            index + 1,
            "Generated by authorized local real-data candidate-b aggregate rules.",
            "Requires business review before formal use.",
            ["manual_review_required", "promote", "downlist_or_suspend", "renewal_review"].includes(
              suggestionCode
            )
          ]
        );
        counters.insertedSuggestions += 1;
      }

      if (work.reviewItem) {
        await client.query(
          `INSERT INTO m1.m2_evaluation_review_items
             (evaluation_result_id, standard_work_id, review_type, review_reason_code, review_status,
              review_priority, is_blocking, audit_metadata_json)
           VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7::jsonb)`,
          [
            evaluationResultId,
            work.workRef,
            work.reviewItem.reviewType,
            work.reviewItem.reviewReasonCode,
            work.reviewItem.reviewPriority,
            work.reviewItem.isBlocking,
            JSON.stringify(reviewMetadata(work, work.reviewItem.reviewType))
          ]
        );
        counters.insertedReviewItems += 1;
      }
    }
    if (versions.basicInfoCanWriteChildren) {
      await client.query(
        `UPDATE m1.basic_info_version
            SET status = 'validated',
                snapshot_work_count = $2,
                snapshot_checksum = $3,
                validated_at = COALESCE(validated_at, now())
          WHERE id = $1 AND status = 'building'`,
        [
          versions.basicInfoVersionId,
          payload.aggregate.evaluatedWorkCount,
          createHash("sha256").update(CANDIDATE_VERSION).digest("hex")
        ]
      );
    }
    await client.query("COMMIT");
    return counters;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function dbSummary(client, payload) {
  const scalar = async (sql, params = []) => Number((await client.query(sql, params)).rows[0]?.value ?? 0);
  const distribution = async (sql, params = []) =>
    Object.fromEntries((await client.query(sql, params)).rows.map((row) => [row.key, Number(row.value)]));
  const resultCount = await scalar(
    "SELECT count(*)::int AS value FROM m1.m2_evaluation_results WHERE candidate_version = $1",
    [CANDIDATE_VERSION]
  );
  const snapshotCount = await scalar(
    `SELECT count(*)::int AS value
       FROM m1.m2_evaluation_input_snapshots s
       JOIN m1.m2_evaluation_results r ON r.id = s.evaluation_result_id
      WHERE r.candidate_version = $1`,
    [CANDIDATE_VERSION]
  );
  const totalHistorical = await client.query(
    `SELECT COALESCE(sum(s.total_historical_revenue), 0)::numeric AS value
       FROM m1.m2_evaluation_input_snapshots s
       JOIN m1.m2_evaluation_results r ON r.id = s.evaluation_result_id
      WHERE r.candidate_version = $1`,
    [CANDIDATE_VERSION]
  );

  return {
    candidateVersion: CANDIDATE_VERSION,
    evaluationResults: resultCount,
    inputSnapshots: snapshotCount,
    latestCompleteMonth: payload.latestCompleteMonth,
    totalHistoricalRevenue: Number(totalHistorical.rows[0].value),
    ratingDistribution: await distribution(
      `SELECT rating AS key, count(*)::int AS value
         FROM m1.m2_evaluation_results
        WHERE candidate_version = $1
        GROUP BY rating`,
      [CANDIDATE_VERSION]
    ),
    lifecycleDistribution: await distribution(
      `SELECT lifecycle AS key, count(*)::int AS value
         FROM m1.m2_evaluation_results
        WHERE candidate_version = $1
        GROUP BY lifecycle`,
      [CANDIDATE_VERSION]
    ),
    riskDistribution: await distribution(
      `SELECT risk_code AS key, count(*)::int AS value
         FROM m1.m2_evaluation_risks k
         JOIN m1.m2_evaluation_results r ON r.id = k.evaluation_result_id
        WHERE r.candidate_version = $1
        GROUP BY risk_code`,
      [CANDIDATE_VERSION]
    ),
    suggestionDistribution: await distribution(
      `SELECT suggestion_code AS key, count(*)::int AS value
         FROM m1.m2_evaluation_suggestions s
         JOIN m1.m2_evaluation_results r ON r.id = s.evaluation_result_id
        WHERE r.candidate_version = $1
        GROUP BY suggestion_code`,
      [CANDIDATE_VERSION]
    ),
    reviewStatusDistribution: await distribution(
      `SELECT review_status AS key, count(*)::int AS value
         FROM m1.m2_evaluation_review_items i
         JOIN m1.m2_evaluation_results r ON r.id = i.evaluation_result_id
        WHERE r.candidate_version = $1
        GROUP BY review_status`,
      [CANDIDATE_VERSION]
    ),
    blockingReviewItems: await scalar(
      `SELECT count(*)::int AS value
         FROM m1.m2_evaluation_review_items i
         JOIN m1.m2_evaluation_results r ON r.id = i.evaluation_result_id
        WHERE r.candidate_version = $1 AND i.review_type = 'blocking_manual_review'`,
      [CANDIDATE_VERSION]
    ),
    advisoryReviewItems: await scalar(
      `SELECT count(*)::int AS value
         FROM m1.m2_evaluation_review_items i
         JOIN m1.m2_evaluation_results r ON r.id = i.evaluation_result_id
        WHERE r.candidate_version = $1 AND i.review_type = 'advisory_review'`,
      [CANDIDATE_VERSION]
    ),
    m2TableCounts: {
      algorithmVersions: await scalar("SELECT count(*)::int AS value FROM m1.m2_evaluation_algorithm_versions"),
      results: await scalar("SELECT count(*)::int AS value FROM m1.m2_evaluation_results"),
      inputSnapshots: await scalar("SELECT count(*)::int AS value FROM m1.m2_evaluation_input_snapshots"),
      risks: await scalar("SELECT count(*)::int AS value FROM m1.m2_evaluation_risks"),
      suggestions: await scalar("SELECT count(*)::int AS value FROM m1.m2_evaluation_suggestions"),
      reviewItems: await scalar("SELECT count(*)::int AS value FROM m1.m2_evaluation_review_items")
    }
  };
}

function table(rows, columns) {
  const lines = [`| ${columns.map(([, label]) => label).join(" | ")} |`];
  lines.push(`|${columns.map(() => "---").join("|")}|`);
  for (const row of rows) {
    lines.push(`| ${columns.map(([key]) => String(row[key] ?? "")).join(" | ")} |`);
  }
  return lines.join("\n");
}

function rowsFromDistribution(distribution) {
  return Object.entries(distribution ?? {}).map(([key, value]) => ({ key, value }));
}

function writeReports(report) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(
    REPORT_MD,
    `# M2 local DB import reconciliation summary v0.1

Mode: authorized local real-data DB-backed development.

Candidate: \`${report.candidateVersion}\`

This is a local development import and reconciliation report, not a final release-approved formal result.

## Migration Evidence

${table(
  [
    { key: "database", value: report.database.databaseName },
    { key: "hostCategory", value: report.database.hostCategory },
    { key: "dockerUsed", value: report.database.dockerUsed },
    { key: "migrationFiles", value: report.migration.migrationFiles },
    { key: "latestSchemaVersion", value: report.migration.latestSchemaVersion },
    { key: "migrationsExecutedThisRun", value: report.migration.migrationsExecuted.length }
  ],
  [["key", "Metric"], ["value", "Value"]]
)}

## Import Counts

${table(rowsFromDistribution(report.import.tableCounts), [["key", "Table"], ["value", "Rows"]])}

## Reconciliation Checks

${table(rowsFromDistribution(report.reconciliation.checks), [["key", "Check"], ["value", "Passed"]])}

## Rating Distribution

${table(rowsFromDistribution(report.databaseSummary.ratingDistribution), [["key", "Rating"], ["value", "Count"]])}

## Lifecycle Distribution

${table(rowsFromDistribution(report.databaseSummary.lifecycleDistribution), [["key", "Lifecycle"], ["value", "Count"]])}

## Review Distribution

${table(
  [
    { key: "blockingReviewItems", value: report.databaseSummary.blockingReviewItems },
    { key: "advisoryReviewItems", value: report.databaseSummary.advisoryReviewItems }
  ],
  [["key", "Metric"], ["value", "Count"]]
)}

No raw rows, real work names, author names, channel names, secrets, or connection strings are written in this report.
`,
    "utf8"
  );
}

function classifyFailure(message) {
  const text = String(message ?? "").toLowerCase();
  if (text.includes("read-only file system") || text.includes("input/output error")) {
    return {
      category: "local_docker_storage_unavailable",
      environmentIssue: true,
      schemaIssue: false,
      dataIssue: false,
      suggestedFixes: [
        "Restart Docker Desktop, then rerun npm run import:m2:real-data:local-db.",
        `If the image remains corrupted, remove and re-pull the local ${DEFAULT_POSTGRES_IMAGE} image, then rerun the import.`,
        "If Docker storage is mounted read-only, restore write access to Docker Desktop storage before rerunning."
      ]
    };
  }
  if (text.includes("migration failed")) {
    return {
      category: "migration_execution_failed",
      environmentIssue: false,
      schemaIssue: true,
      dataIssue: false,
      suggestedFixes: ["Inspect the failed migration name and error, patch the forward migration, and rerun."]
    };
  }
  if (text.includes("connect") || text.includes("econnrefused")) {
    return {
      category: "local_database_connection_failed",
      environmentIssue: true,
      schemaIssue: false,
      dataIssue: false,
      suggestedFixes: ["Ensure local PostgreSQL is running on the configured local port, then rerun."]
    };
  }
  return {
    category: "unknown_local_db_import_failure",
    environmentIssue: true,
    schemaIssue: false,
    dataIssue: false,
    suggestedFixes: ["Review the sanitized error message and rerun after fixing the local environment."]
  };
}

function writeBlockedReport(error) {
  const failure = classifyFailure(error.message);
  const report = {
    schema: "m2.authorized_real_data.local_db_import_reconciliation.v0.1",
    generatedAt: new Date().toISOString(),
    mode: "authorized_local_real_data_db_backed_development",
    status: "blocked",
    candidateVersion: CANDIDATE_VERSION,
    notFinalReleaseApproved: true,
    failure,
    sanitizedError: error.message,
    database: {
      hostCategory: "local",
      formalDatabaseConnected: false
    },
    safeOutputBoundary: {
      rawRowsWritten: false,
      realWorkNamesWritten: false,
      realAuthorNamesWritten: false,
      realChannelNamesWritten: false,
      secretsWritten: false,
      connectionStringsWritten: false
    }
  };
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(
    REPORT_MD,
    `# M2 local DB import reconciliation summary v0.1

Status: blocked.

Candidate: \`${CANDIDATE_VERSION}\`

The local DB-backed import did not complete. This is not a schema/data success report and not a final release-approved result.

## Failure

- Category: \`${failure.category}\`
- Environment issue: \`${failure.environmentIssue}\`
- Schema issue: \`${failure.schemaIssue}\`
- Data issue: \`${failure.dataIssue}\`

## Suggested Fixes

${failure.suggestedFixes.map((item) => `- ${item}`).join("\n")}

No raw rows, real work names, author names, channel names, secrets, or connection strings are written in this report.
`,
    "utf8"
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const values = readDotEnv(join(ROOT, ".env.local"));
  const config = localConfig(values);
  const payload = runPayloadBuilder();
  const reconciliation = readJson("docs/analysis/m2-real-data/M2-strict-reconciliation-summary-v0.1.json");
  const candidate = readJson("docs/analysis/m2-real-data/M2-realdata-dev-candidate-b-summary-v0.1.json");

  if (args.dryRun) {
    const dryRunReport = {
      status: "dry_run",
      candidateVersion: CANDIDATE_VERSION,
      plannedWorkCount: payload.works.length,
      plannedBlockingReviewItems: payload.works.filter((work) => work.reviewItem?.isBlocking).length,
      plannedAdvisoryReviewItems: payload.works.filter((work) => work.reviewItem && !work.reviewItem.isBlocking).length,
      rawRowsWritten: false,
      secretsWritten: false
    };
    console.log(JSON.stringify(dryRunReport, null, 2));
    return;
  }

  const docker = ensureDockerPostgres(config, args);
  await ensureRolesAndDatabase(config);
  const migration = await runMigrations(config);

  const importResult = await withClient(migrationClient(config), async (client) =>
    importPayload(client, payload, reconciliation, { clear: args.clear })
  );
  const databaseSummary = await withClient(migrationClient(config), async (client) => dbSummary(client, payload));
  const reconciliationSummary = summarizeReconciliation({
    fileSummary: {
      candidateVersion: candidate.candidateVersion,
      evaluatedWorkCount: candidate.evaluatedWorkCount,
      latestCompleteMonth: payload.latestCompleteMonth,
      ratingDistribution: candidate.ratingDistribution,
      lifecycleDistribution: candidate.lifecycleDistribution,
      manualReviewRequiredCount: candidate.manualReviewRequiredCount,
      advisoryOnlyCount: candidate.advisoryOnlyCount
    },
    dbSummary: databaseSummary
  });

  const report = {
    schema: "m2.authorized_real_data.local_db_import_reconciliation.v0.1",
    generatedAt: new Date().toISOString(),
    mode: "authorized_local_real_data_db_backed_development",
    candidateVersion: CANDIDATE_VERSION,
    notFinalReleaseApproved: true,
    database: {
      databaseName: config.databaseName,
      hostCategory: "local",
      port: config.port,
      dockerUsed: docker.dockerUsed,
      container: docker.container,
      formalDatabaseConnected: false
    },
    migration,
    import: {
      ...importResult,
      tableCounts: databaseSummary.m2TableCounts,
      rawRowsWritten: false,
      realWorkNamesWritten: false,
      secretsWritten: false
    },
    fileSummary: {
      rowReconciliation: reconciliation.rowReconciliation,
      amountReconciliation: reconciliation.amountReconciliation,
      candidate: {
        evaluatedWorkCount: candidate.evaluatedWorkCount,
        manualReviewRequiredCount: candidate.manualReviewRequiredCount,
        advisoryOnlyCount: candidate.advisoryOnlyCount,
        ratingDistribution: candidate.ratingDistribution,
        lifecycleDistribution: candidate.lifecycleDistribution
      }
    },
    databaseSummary,
    distributionComparisons: {
      rating: compareDistribution(candidate.ratingDistribution, databaseSummary.ratingDistribution),
      lifecycle: compareDistribution(candidate.lifecycleDistribution, databaseSummary.lifecycleDistribution),
      risks: compareDistribution(payload.aggregate.riskDistribution, databaseSummary.riskDistribution),
      suggestions: compareDistribution(payload.aggregate.suggestionDistribution, databaseSummary.suggestionDistribution)
    },
    reconciliation: reconciliationSummary,
    safeOutputBoundary: {
      rawRowsWritten: false,
      realWorkNamesWritten: false,
      realAuthorNamesWritten: false,
      realChannelNamesWritten: false,
      secretsWritten: false,
      connectionStringsWritten: false
    }
  };
  writeReports(report);
  console.log(
    JSON.stringify(
      {
        status: report.reconciliation.passed ? "pass" : "failed",
        candidateVersion: CANDIDATE_VERSION,
        database: config.databaseName,
        latestSchemaVersion: migration.latestSchemaVersion,
        evaluationResults: databaseSummary.evaluationResults,
        blockingReviewItems: databaseSummary.blockingReviewItems,
        advisoryReviewItems: databaseSummary.advisoryReviewItems,
        report: REPORT_JSON.replaceAll("\\", "/"),
        rawRowsWritten: false,
        secretsWritten: false
      },
      null,
      2
    )
  );
  if (!report.reconciliation.passed) {
    process.exit(1);
  }
}

main().catch((error) => {
  writeBlockedReport(error);
  console.error(
    JSON.stringify(
      {
        status: "failed",
        error: error.message,
        rawRowsWritten: false,
        secretsWritten: false
      },
      null,
      2
    )
  );
  process.exit(1);
});
