import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertLocalDatabaseTarget } from "../../src/domain/oldProductEvaluation/realDataDbImportPlan.js";

const { Client } = pg;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PAYLOAD_PATH = join(
  ROOT,
  "data",
  "private-output",
  "m2-formal-execution",
  "m2-formal-execution-payload-v1.json"
);
const BACKUP_PATH = join(
  ROOT,
  "data",
  "private-output",
  "m2-formal-execution",
  "m2-pre-formal-apply-local.dump"
);
const REPORT_JSON = join(
  ROOT,
  "docs",
  "analysis",
  "m2-real-data",
  "M2-formal-local-execution-summary-v1.json"
);
const REPORT_MD = join(
  ROOT,
  "docs",
  "analysis",
  "m2-real-data",
  "M2-formal-local-execution-summary-v1.md"
);

const EXPECTED_SCHEMA = "m2.formal_execution_private_payload.v1";
const EXPECTED_SCHEMA_VERSION = "0071.020";
const ACTOR = "codex_m2_formal_local_execution";
const INSERT_BATCH_SIZE = 300;

function progress(message) {
  process.stderr.write(`[m2-formal-db] ${message}\n`);
}

function parseArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  const apply = argv.includes("--apply");
  const summary = argv.includes("--summary");
  if ([dryRun, apply, summary].filter(Boolean).length !== 1) {
    throw new Error("Choose exactly one mode: --dry-run, --apply, or --summary.");
  }
  return { dryRun, apply, summary };
}

function readDotEnv(path) {
  if (!existsSync(path)) {
    throw new Error("Missing .env.local; initialize the isolated local database first.");
  }
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const [key, ...rest] = trimmed.split("=");
    values[key] = rest.join("=").trim();
  }
  return values;
}

function requireValue(values, name) {
  const value = String(values[name] ?? "").trim();
  if (!value) {
    throw new Error(`${name} is required in .env.local.`);
  }
  return value;
}

function localConfig(values) {
  const host = requireValue(values, "M1_LOCAL_DB_HOST");
  const port = Number(requireValue(values, "M1_LOCAL_DEV_DB_PORT"));
  const databaseName = requireValue(values, "M1_LOCAL_DEV_DB_NAME");
  const environmentName = requireValue(values, "M1_LOCAL_DEV_ENVIRONMENT_NAME");
  const guard = assertLocalDatabaseTarget({ host, databaseName, environmentName });
  if (!guard.localOnly || !["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error("Refusing a non-local database target.");
  }
  return {
    host,
    port,
    database: databaseName,
    environmentName,
    user: "migration_owner",
    password: requireValue(values, "M1_MIGRATION_OWNER_PASSWORD")
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableHash(value) {
  return sha256(JSON.stringify(sortObject(value)));
}

function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortObject(item)])
    );
  }
  return value;
}

async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function loadPayload() {
  if (!existsSync(PAYLOAD_PATH)) {
    throw new Error("Missing private formal execution payload; run prepare:m2:formal-local first.");
  }
  return JSON.parse(readFileSync(PAYLOAD_PATH, "utf8"));
}

export function validateFormalExecutionPayload(payload) {
  const issues = [];
  if (payload?.schema !== EXPECTED_SCHEMA) {
    issues.push("schema_mismatch");
  }
  if (payload?.privateOnly !== true || payload?.notForCommit !== true) {
    issues.push("private_boundary_missing");
  }
  if (payload?.formalEvaluationAuthorized !== true) {
    issues.push("formal_evaluation_authorization_missing");
  }
  if (payload?.finalReleaseApproved !== false) {
    issues.push("final_release_must_remain_unapproved");
  }
  if (payload?.operatingSuggestionsIncluded !== false) {
    issues.push("operating_suggestions_must_be_absent");
  }
  if (!Array.isArray(payload?.records) || payload.records.length !== 3053) {
    issues.push("formal_work_scope_mismatch");
  }
  if (Number(payload?.factImport?.factRowCount) !== 192872) {
    issues.push("fact_row_scope_mismatch");
  }
  if (payload?.scopeReconciliation?.scopeFullyAligned !== true) {
    issues.push("scope_reconciliation_failed");
  }
  if (Number(payload?.reviewDecisionSummary?.pending) !== 0) {
    issues.push("review_decisions_pending");
  }
  if (Number(payload?.summary?.operatingSuggestionCount) !== 0) {
    issues.push("operating_suggestion_count_nonzero");
  }
  if (payload?.summary?.modelValidation?.verdict !== "CONDITIONAL PASS") {
    issues.push("unexpected_model_verdict");
  }
  const ids = new Set();
  for (const record of payload?.records ?? []) {
    const id = String(record.standardWorkId ?? "").trim();
    if (!id || ids.has(id)) {
      issues.push("missing_or_duplicate_standard_work_id");
      break;
    }
    ids.add(id);
    for (const field of [
      "standardWorkName",
      "authorName",
      "copyrightStart",
      "copyrightEndType",
      "copyrightEndValue",
      "workStatus",
      "audioRightsStatus",
      "rating",
      "lifecycle",
      "inputHash"
    ]) {
      if (record[field] === undefined || record[field] === null || String(record[field]).trim() === "") {
        issues.push(`record_field_missing:${field}`);
      }
    }
    if (Object.hasOwn(record, "operatingSuggestion") || Object.hasOwn(record, "suggestions")) {
      issues.push("record_operating_suggestion_present");
    }
    if (
      record.copyrightEndType === "exact_date" &&
      record.copyrightStart &&
      record.copyrightEnd &&
      record.copyrightEnd < record.copyrightStart
    ) {
      issues.push("record_copyright_chronology_invalid");
    }
  }
  return {
    valid: issues.length === 0,
    issues: [...new Set(issues)],
    workCount: ids.size,
    factRowCount: Number(payload?.factImport?.factRowCount ?? 0),
    candidateVersion: payload?.candidateVersion ?? null,
    finalReleaseApproved: payload?.finalReleaseApproved === true,
    operatingSuggestionsIncluded: payload?.operatingSuggestionsIncluded === true
  };
}

async function validateFactFile(payload) {
  const relativePath = payload.factImport.factFile;
  const path = resolve(ROOT, relativePath);
  if (!path.startsWith(resolve(ROOT, "data", "private-output"))) {
    throw new Error("Private fact file escaped data/private-output.");
  }
  if (!existsSync(path)) {
    throw new Error("Private fact file is missing.");
  }
  const actualHash = await hashFile(path);
  if (actualHash !== payload.factImport.factFileSha256) {
    throw new Error("Private fact file hash mismatch.");
  }
  let rowCount = 0;
  for await (const fact of factRows(path)) {
    rowCount += 1;
    if (
      !fact.sourceRowNumber ||
      !fact.billMonth ||
      !fact.rawChannelId ||
      !fact.rawChannelName ||
      !fact.rawWorkId ||
      !fact.standardWorkId ||
      !["raw", "historical"].includes(fact.mappingKind)
    ) {
      throw new Error("Private fact file contains an invalid row.");
    }
  }
  if (rowCount !== Number(payload.factImport.factRowCount)) {
    throw new Error("Private fact file row count mismatch.");
  }
  return { path, rowCount, sha256: actualHash };
}

async function* factRows(path) {
  const input = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim()) {
      yield JSON.parse(line);
    }
  }
}

function databaseClient(config) {
  return new Client({
    ...config,
    connectionTimeoutMillis: 5000,
    statement_timeout: 0,
    application_name: "m2-formal-local-execution"
  });
}

async function inspectDatabase(client) {
  const server = await client.query(
    `SELECT current_database() AS database,
            inet_server_addr()::text AS host,
            inet_server_port() AS port,
            current_setting('server_version_num')::int AS "serverVersionNum"`
  );
  const version = await client.query(
    `SELECT version
       FROM flyway_history.flyway_schema_history
      WHERE success = true AND version IS NOT NULL
      ORDER BY installed_rank DESC
      LIMIT 1`
  );
  const state = await client.query(
    "SELECT lifecycle_status AS status FROM m1.system_state WHERE id = 1"
  );
  const counts = await client.query(
    `SELECT
       (SELECT count(*)::int FROM m1.income_fact) AS "incomeFacts",
       (SELECT count(*)::int FROM m1.m2_evaluation_results) AS "evaluationResults",
       (SELECT count(*)::int FROM m1.m2_formal_export_packages) AS "exportPackages"`
  );
  return {
    ...server.rows[0],
    schemaVersion: version.rows[0]?.version ?? null,
    lifecycleStatus: state.rows[0]?.status ?? null,
    counts: counts.rows[0]
  };
}

function assertDatabaseBoundary(config, database) {
  if (database.database !== config.database) {
    throw new Error("Connected database name differs from the authorized local target.");
  }
  if (Number(database.serverVersionNum) < 160000 || Number(database.serverVersionNum) >= 170000) {
    throw new Error("Formal local execution requires PostgreSQL 16.x.");
  }
  if (database.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    throw new Error(
      `Expected Flyway schema ${EXPECTED_SCHEMA_VERSION}, found ${database.schemaVersion ?? "none"}.`
    );
  }
}

async function insertRows(client, table, columns, rows, options = {}) {
  if (rows.length === 0) {
    return [];
  }
  const returned = [];
  const batchSize = options.batchSize ?? INSERT_BATCH_SIZE;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values = [];
    const tuples = batch.map((row) => {
      const placeholders = columns.map((_, columnIndex) => {
        values.push(row[columnIndex]);
        return `$${values.length}`;
      });
      return `(${placeholders.join(",")})`;
    });
    const conflict = options.conflict ? ` ${options.conflict}` : "";
    const returning = options.returning ? ` RETURNING ${options.returning}` : "";
    let result;
    try {
      result = await client.query(
        `INSERT INTO ${table} (${columns.join(",")}) VALUES ${tuples.join(",")}${conflict}${returning}`,
        values
      );
    } catch (error) {
      throw new Error(
        `Insert failed for ${table} at row offset ${offset}: ${error.message}`,
        { cause: error }
      );
    }
    returned.push(...result.rows);
  }
  return returned;
}

async function ensureBootstrap(client) {
  const state = await client.query(
    "SELECT lifecycle_status AS status FROM m1.system_state WHERE id = 1 FOR UPDATE"
  );
  if (state.rows[0]?.status === "schema_initialized") {
    await client.query("SELECT m1.begin_master_data_initialization($1)", [ACTOR]);
    await client.query("SELECT m1.initialize_bootstrap_versions($1)", [ACTOR]);
    return "ready_for_bill_activation";
  }
  if (!["ready_for_bill_activation", "operational"].includes(state.rows[0]?.status)) {
    throw new Error(`Unsupported local lifecycle state: ${state.rows[0]?.status}`);
  }
  return state.rows[0].status;
}

async function createExecutionTask(client, payload) {
  const idempotencyKey = `m2-formal-local:${payload.payloadHash}`;
  const result = await client.query(
    `INSERT INTO m1.background_task
       (task_type, logical_operation_key, idempotency_key, status, business_stage,
        payload, started_at, created_by)
     VALUES ('m2_formal_evaluation', $1, $2, 'running', 'M2_formal_local_execution',
             $3::jsonb, clock_timestamp(), $4)
     RETURNING id`,
    [
      payload.candidateVersion,
      idempotencyKey,
      JSON.stringify({
        payloadHash: payload.payloadHash,
        workCount: payload.records.length,
        factRowCount: payload.factImport.factRowCount,
        finalReleaseApproved: false,
        operatingSuggestionsIncluded: false
      }),
      ACTOR
    ]
  );
  const taskId = result.rows[0].id;
  await client.query(
    `INSERT INTO m1.background_task_event
       (task_id, event_type, from_status, to_status, message, event_payload, created_by)
     VALUES ($1, 'formal_execution_started', 'queued', 'running',
             'Authorized local M2 formal execution started.', $2::jsonb, $3)`,
    [taskId, JSON.stringify({ payloadHash: payload.payloadHash }), ACTOR]
  );
  return taskId;
}

async function createClassificationAndTagVersions(client, payload, taskId) {
  await client.query(
    `INSERT INTO m1.classification_system(system_code, display_name, status, created_by)
     VALUES ('publication', '出版物', 'active', $1), ('web', '网文', 'active', $1)
     ON CONFLICT(system_code) DO UPDATE SET display_name = EXCLUDED.display_name`,
    [ACTOR]
  );
  const systemsResult = await client.query(
    "SELECT id, system_code FROM m1.classification_system"
  );
  const systemIds = Object.fromEntries(
    systemsResult.rows.map((row) => [row.system_code, row.id])
  );
  const releaseVersion = await nextVersion(client, "m1.classification_release");
  const classificationRelease = await client.query(
    `INSERT INTO m1.classification_release(version_no, status, release_note, created_by)
     VALUES ($1, 'draft', 'User-confirmed 3053-work classification foundation', $2)
     RETURNING id`,
    [releaseVersion, ACTOR]
  );
  const tagVersion = await nextVersion(client, "m1.tag_release");
  const tagRelease = await client.query(
    `INSERT INTO m1.tag_release(version_no, status, release_note, created_by)
     VALUES ($1, 'draft', 'User-confirmed auxiliary-tag foundation', $2)
     RETURNING id`,
    [tagVersion, ACTOR]
  );
  const classificationReleaseId = classificationRelease.rows[0].id;
  const tagReleaseId = tagRelease.rows[0].id;

  const nodeIds = new Map();
  const paths = [...new Set(payload.records.map((row) => JSON.stringify(row.classificationPath)))]
    .map((item) => JSON.parse(item))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  for (const path of paths) {
    const systemCode = path[0] === "出版物" ? "publication" : "web";
    let parentId = null;
    for (let index = 0; index < path.length; index += 1) {
      const key = `${systemCode}|${path.slice(0, index + 1).join("|")}`;
      if (nodeIds.has(key)) {
        parentId = nodeIds.get(key);
        continue;
      }
      const node = await client.query(
        `INSERT INTO m1.classification_node
           (classification_release_id, classification_system_id, parent_id,
            node_code, display_name, level, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          classificationReleaseId,
          systemIds[systemCode],
          parentId,
          `node-${stableHash(key).slice(0, 20)}`,
          path[index],
          index + 1,
          nodeIds.size + 1
        ]
      );
      parentId = node.rows[0].id;
      nodeIds.set(key, parentId);
    }
  }

  const tagNames = [...new Set(payload.records.flatMap((row) => row.auxiliaryTags ?? []))].sort();
  const tagRows = await insertRows(
    client,
    "m1.tag",
    ["tag_release_id", "tag_code", "display_name", "normalized_name", "tag_type", "sort_order"],
    tagNames.map((name, index) => [
      tagReleaseId,
      `tag-${stableHash(name).slice(0, 20)}`,
      name,
      name,
      "auxiliary_content",
      index + 1
    ]),
    { returning: "id, display_name" }
  );
  const tagIds = new Map(tagRows.map((row) => [row.display_name, row.id]));
  return { classificationReleaseId, tagReleaseId, nodeIds, tagIds, taskId };
}

async function nextVersion(client, table) {
  const result = await client.query(`SELECT COALESCE(max(version_no), 0) + 1 AS value FROM ${table}`);
  return Number(result.rows[0].value);
}

async function createBasicInfoVersion(client, payload, versions) {
  const authorNames = [...new Set(payload.records.map((row) => row.authorName))].sort();
  const authorRows = await insertRows(
    client,
    "m1.author",
    ["author_code", "primary_name", "status", "created_by"],
    authorNames.map((name) => [
      `author-${stableHash(name).slice(0, 24)}`,
      name,
      "active",
      ACTOR
    ]),
    {
      conflict: "ON CONFLICT(author_code) DO UPDATE SET primary_name = EXCLUDED.primary_name",
      returning: "id, author_code"
    }
  );
  const authorIds = new Map(authorRows.map((row) => [row.author_code, row.id]));

  await insertRows(
    client,
    "m1.standard_work",
    ["standard_work_id", "identity_source", "created_by"],
    payload.records.map((row) => [row.standardWorkId, "ops_confirmed", ACTOR]),
    { conflict: "ON CONFLICT(standard_work_id) DO NOTHING" }
  );

  const versionNo = await nextVersion(client, "m1.basic_info_version");
  const version = await client.query(
    `INSERT INTO m1.basic_info_version
       (version_no, status, source_type, classification_release_id, tag_release_id,
        build_task_id, snapshot_work_count, created_by)
     VALUES ($1, 'building', 'formal_basic_info', $2, $3, $4, 0, $5)
     RETURNING id`,
    [
      versionNo,
      versions.classificationReleaseId,
      versions.tagReleaseId,
      versions.taskId,
      ACTOR
    ]
  );
  const basicInfoVersionId = version.rows[0].id;
  const sourceRef = `formal-input:${payload.payloadHash}`;
  await insertRows(
    client,
    "m1.basic_info_version_work",
    [
      "basic_info_version_id",
      "standard_work_id",
      "standard_work_name",
      "author_id",
      "copyright_start_date",
      "copyright_end_date",
      "copyright_source_priority",
      "source_record_ref",
      "copyright_end_type",
      "copyright_end_value",
      "work_status",
      "audio_rights_status",
      "source_metadata_json"
    ],
    payload.records.map((row) => [
      basicInfoVersionId,
      row.standardWorkId,
      row.standardWorkName,
      authorIds.get(`author-${stableHash(row.authorName).slice(0, 24)}`),
      row.copyrightStart,
      row.copyrightEnd,
      "formal_basic_info_version",
      sourceRef,
      row.copyrightEndType,
      row.copyrightEndValue,
      row.workStatus,
      row.audioRightsStatus,
      {
        inputHash: row.inputHash,
        reviewDecisionStatus: row.reviewDecisionStatus,
        operatingSuggestionsIncluded: false
      }
    ])
  );
  await insertRows(
    client,
    "m1.standard_work_status_history",
    ["standard_work_id", "status", "status_basis", "valid_from", "created_by"],
    payload.records.map((row) => [
      row.standardWorkId,
      row.workStatus,
      "post_foundation_user_confirmed",
      payload.generatedAt,
      ACTOR
    ])
  );

  await insertRows(
    client,
    "m1.work_classification_assignment",
    ["basic_info_version_id", "standard_work_id", "classification_node_id", "source_type"],
    payload.records.map((row) => {
      const systemCode = row.classificationPath[0] === "出版物" ? "publication" : "web";
      const key = `${systemCode}|${row.classificationPath.join("|")}`;
      return [
        basicInfoVersionId,
        row.standardWorkId,
        versions.nodeIds.get(key),
        "formal_basic_info"
      ];
    })
  );
  await insertRows(
    client,
    "m1.work_tag_assignment",
    ["basic_info_version_id", "standard_work_id", "tag_id", "source_type"],
    payload.records.flatMap((row) =>
      (row.auxiliaryTags ?? []).map((tag) => [
        basicInfoVersionId,
        row.standardWorkId,
        versions.tagIds.get(tag),
        "formal_basic_info"
      ])
    )
  );
  const snapshotChecksum = stableHash(payload.records.map((row) => row.inputHash));
  await client.query(
    `UPDATE m1.basic_info_version
        SET status = 'validated', snapshot_work_count = $2,
            snapshot_checksum = $3, validated_at = clock_timestamp()
      WHERE id = $1`,
    [basicInfoVersionId, payload.records.length, snapshotChecksum]
  );
  return { basicInfoVersionId, snapshotChecksum };
}

async function createImportBatch(client, payload, taskId) {
  const rules = await client.query(
    `INSERT INTO m1.cleaning_rule_version
       (rule_code, version_no, status, rule_payload, effective_from, created_by)
     VALUES ('m2_formal_cleaned_bill', 1, 'active', $1::jsonb, clock_timestamp(), $2)
     ON CONFLICT(rule_code, version_no) DO UPDATE SET rule_payload = EXCLUDED.rule_payload
     RETURNING id`,
    [
      JSON.stringify({
        payloadHash: payload.payloadHash,
        factChecksum: payload.factImport.factChecksum,
        rowCount: payload.factImport.factRowCount
      }),
      ACTOR
    ]
  );
  const source = payload.factImport.sourceBill;
  const fingerprint = await client.query(
    `INSERT INTO m1.file_fingerprint_registry(sha256, file_size_bytes)
     VALUES ($1, $2)
     ON CONFLICT(sha256) DO UPDATE SET file_size_bytes = EXCLUDED.file_size_bytes
     RETURNING id`,
    [source.sha256, source.fileSizeBytes]
  );
  const file = await client.query(
    `INSERT INTO m1.import_file
       (fingerprint_id, original_filename, retention_status, row_count, total_amount, uploaded_by)
     VALUES ($1, $2, 'retained', $3, $4, $5)
     RETURNING id`,
    [
      fingerprint.rows[0].id,
      source.originalFilename,
      payload.factImport.factRowCount,
      payload.factImport.factTotalAmount,
      ACTOR
    ]
  );
  const batchNo = `M2-FORMAL-${payload.payloadHash.slice(0, 16)}`;
  const batch = await client.query(
    `INSERT INTO m1.import_batch
       (batch_no, status, source_type, rule_version_id, raw_row_count,
        raw_total_amount, created_by)
     VALUES ($1, 'draft', 'normal_upload', $2, $3, $4, $5)
     RETURNING id`,
    [
      batchNo,
      rules.rows[0].id,
      payload.factImport.factRowCount,
      payload.factImport.factTotalAmount,
      ACTOR
    ]
  );
  const importBatchId = batch.rows[0].id;
  const importFileId = file.rows[0].id;
  await client.query(
    `INSERT INTO m1.import_batch_file(import_batch_id, import_file_id, file_role)
     VALUES ($1, $2, 'source_bill')`,
    [importBatchId, importFileId]
  );
  await client.query(
    `INSERT INTO m1.background_task_event
       (task_id, event_type, message, event_payload, created_by)
     VALUES ($1, 'formal_import_started', 'Formal income-fact import started.', $2::jsonb, $3)`,
    [taskId, JSON.stringify({ batchNo, factRowCount: payload.factImport.factRowCount }), ACTOR]
  );
  return { importBatchId, importFileId, batchNo };
}

async function importIncomeFacts(client, payload, factFile, batch) {
  let rows = [];
  let imported = 0;
  const columns = [
    "import_batch_id",
    "import_file_id",
    "source_sheet_name",
    "source_row_number",
    "bill_month",
    "raw_channel_id",
    "raw_channel_name",
    "raw_authorization_category",
    "raw_work_id",
    "raw_work_name",
    "actual_sales_amount",
    "row_hash"
  ];
  for await (const fact of factRows(factFile.path)) {
    rows.push([
      batch.importBatchId,
      batch.importFileId,
      payload.factImport.sourceBill.sourceSheetName,
      fact.sourceRowNumber,
      fact.billMonth,
      fact.rawChannelId,
      fact.rawChannelName,
      fact.rawAuthorizationCategory,
      fact.rawWorkId,
      fact.rawWorkName,
      fact.actualSalesAmount,
      fact.rowHash
    ]);
    if (rows.length >= INSERT_BATCH_SIZE) {
      await insertRows(client, "m1.income_fact", columns, rows);
      imported += rows.length;
      rows = [];
      if (imported % 15000 === 0) {
        progress(`imported ${imported} income facts`);
      }
    }
  }
  if (rows.length) {
    await insertRows(client, "m1.income_fact", columns, rows);
    imported += rows.length;
  }
  if (imported !== payload.factImport.factRowCount) {
    throw new Error("Income-fact import count mismatch.");
  }
  await insertRows(
    client,
    "m1.import_batch_month",
    ["import_batch_id", "bill_month", "row_count", "amount_total", "source_fact_checksum"],
    payload.factImport.monthly.map((row) => [
      batch.importBatchId,
      row.billMonth,
      row.rowCount,
      row.amountTotal,
      row.sourceFactChecksum
    ])
  );
  return imported;
}

async function createMappingVersion(client, payload, taskId, batch) {
  const active = await client.query(
    "SELECT id FROM m1.mapping_version WHERE status = 'active'"
  );
  const versionNo = await nextVersion(client, "m1.mapping_version");
  const mapping = await client.query(
    `INSERT INTO m1.mapping_version
       (version_no, status, base_version_id, trigger_type, trigger_ref,
        build_task_id, created_by)
     VALUES ($1, 'building', $2, 'formal_local_execution', $3, $4, $5)
     RETURNING id`,
    [versionNo, active.rows[0]?.id ?? null, payload.payloadHash, taskId, ACTOR]
  );
  const mappingVersionId = mapping.rows[0].id;

  const workForms = new Map();
  for (const row of [
    ...payload.factImport.rawMappings,
    ...payload.factImport.historicalMappings
  ]) {
    workForms.set(`${row.standardWorkId}|${row.businessForm}`, [
      row.standardWorkId,
      row.businessForm,
      ACTOR
    ]);
  }
  await insertRows(
    client,
    "m1.work_business_form",
    ["standard_work_id", "business_form", "created_by"],
    [...workForms.values()],
    { conflict: "ON CONFLICT(standard_work_id, business_form) DO NOTHING" }
  );

  const channelsByCode = new Map();
  for (const row of payload.factImport.channels) {
    if (!channelsByCode.has(row.channelCode)) {
      channelsByCode.set(row.channelCode, row);
    }
  }
  const channelRows = await insertRows(
    client,
    "m1.channel",
    ["channel_code", "display_name", "status", "created_by"],
    [...channelsByCode.values()].map((row) => [row.channelCode, row.rawChannelName, "active", ACTOR]),
    {
      conflict: "ON CONFLICT(channel_code) DO UPDATE SET display_name = EXCLUDED.display_name",
      returning: "id, channel_code"
    }
  );
  const channelIds = new Map(channelRows.map((row) => [row.channel_code, row.id]));
  const aliasRows = await insertRows(
    client,
    "m1.channel_alias",
    [
      "mapping_version_id",
      "channel_id",
      "raw_channel_id",
      "raw_channel_name",
      "normalized_channel_name",
      "mapping_source"
    ],
    payload.factImport.channels.map((row) => [
      mappingVersionId,
      channelIds.get(row.channelCode),
      row.rawChannelId,
      row.rawChannelName,
      row.rawChannelName.trim(),
      "bill_observed"
    ]),
    { returning: "id, raw_channel_id, raw_channel_name" }
  );
  const channelKeyByAlias = new Map(
    payload.factImport.channels.map((row) => [
      `${row.rawChannelId}\u0000${row.rawChannelName}`,
      row.channelKey
    ])
  );
  const aliasIds = new Map();
  for (const row of aliasRows) {
    const key = channelKeyByAlias.get(`${row.raw_channel_id}\u0000${row.raw_channel_name}`);
    aliasIds.set(key, row.id);
  }

  const rawRows = await insertRows(
    client,
    "m1.raw_work_id_mapping",
    ["mapping_version_id", "raw_work_id", "standard_work_id", "business_form", "mapping_source"],
    payload.factImport.rawMappings.map((row) => [
      mappingVersionId,
      row.rawWorkId,
      row.standardWorkId,
      row.businessForm,
      "id_rule"
    ]),
    { returning: "id, raw_work_id" }
  );
  const rawMappingIds = new Map(rawRows.map((row) => [row.raw_work_id, row.id]));

  const issueRun = await client.query(
    `INSERT INTO m1.issue_run
       (run_type, mapping_version_id, run_no, status, created_by)
     VALUES ('mapping', $1, 1, 'running', $2)
     RETURNING id`,
    [mappingVersionId, ACTOR]
  );
  const historicalMappingIds = new Map();
  for (const row of payload.factImport.historicalMappings) {
    const issue = await client.query(
      `INSERT INTO m1.data_issue
         (issue_run_id, issue_type, severity, blocking, group_key,
          sample_ref, status, created_by)
       VALUES ($1, 'historical_volume_mapping', 'info', false, $2,
               $3::jsonb, 'resolved', $4)
       RETURNING id`,
      [
        issueRun.rows[0].id,
        `historical-${stableHash(row.rawWorkId).slice(0, 20)}`,
        JSON.stringify({
          rawWorkIdHash: stableHash(row.rawWorkId),
          targetStandardWorkId: row.standardWorkId,
          source: "user_confirmed_mapping_candidate"
        }),
        ACTOR
      ]
    );
    await client.query(
      `INSERT INTO m1.data_issue_decision
         (issue_id, decision, decision_payload, decided_by)
       VALUES ($1, 'map_to_existing', $2::jsonb, $3)`,
      [
        issue.rows[0].id,
        JSON.stringify({ targetStandardWorkId: row.standardWorkId }),
        ACTOR
      ]
    );
    const mappingRow = await client.query(
      `INSERT INTO m1.historical_volume_mapping
         (mapping_version_id, historical_raw_work_id, target_standard_work_id,
          business_form, confirmed_issue_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        mappingVersionId,
        row.rawWorkId,
        row.standardWorkId,
        row.businessForm,
        issue.rows[0].id
      ]
    );
    historicalMappingIds.set(row.rawWorkId, mappingRow.rows[0].id);
  }
  await client.query(
    "UPDATE m1.issue_run SET status = 'completed', finished_at = clock_timestamp() WHERE id = $1",
    [issueRun.rows[0].id]
  );
  return {
    mappingVersionId,
    aliasIds,
    channelIds,
    rawMappingIds,
    historicalMappingIds,
    batch
  };
}

async function createProjections(client, payload, factFile, mapping) {
  const factResult = await client.query(
    `SELECT id, source_row_number
       FROM m1.income_fact
      WHERE import_batch_id = $1`,
    [mapping.batch.importBatchId]
  );
  const factIds = new Map(
    factResult.rows.map((row) => [Number(row.source_row_number), row.id])
  );
  const channelCodeByKey = new Map(
    payload.factImport.channels.map((row) => [row.channelKey, row.channelCode])
  );
  const columns = [
    "mapping_version_id",
    "income_fact_id",
    "channel_id",
    "standard_work_id",
    "business_form",
    "channel_alias_id",
    "raw_work_mapping_id",
    "historical_volume_mapping_id",
    "projection_rule_code"
  ];
  let rows = [];
  let projected = 0;
  for await (const fact of factRows(factFile.path)) {
    const rawMappingId = mapping.rawMappingIds.get(fact.rawWorkId) ?? null;
    const historicalMappingId = mapping.historicalMappingIds.get(fact.rawWorkId) ?? null;
    const channelCode = channelCodeByKey.get(fact.channelKey);
    rows.push([
      mapping.mappingVersionId,
      factIds.get(Number(fact.sourceRowNumber)),
      mapping.channelIds.get(channelCode),
      fact.standardWorkId,
      fact.businessForm,
      mapping.aliasIds.get(fact.channelKey),
      rawMappingId,
      historicalMappingId,
      rawMappingId ? "direct_id_rule" : "confirmed_historical_volume"
    ]);
    if (rows.length >= INSERT_BATCH_SIZE) {
      await insertRows(client, "m1.income_projection", columns, rows);
      projected += rows.length;
      rows = [];
      if (projected % 15000 === 0) {
        progress(`created ${projected} income projections`);
      }
    }
  }
  if (rows.length) {
    await insertRows(client, "m1.income_projection", columns, rows);
    projected += rows.length;
  }
  if (projected !== payload.factImport.factRowCount) {
    throw new Error("Income projection count mismatch.");
  }
  await client.query(
    `INSERT INTO m1.mapping_version_work_metric
       (mapping_version_id, standard_work_id, launch_month,
        positive_fact_count, source_projection_checksum)
     SELECT $1, p.standard_work_id,
            min(f.bill_month) FILTER (WHERE f.actual_sales_amount > 0),
            count(*) FILTER (WHERE f.actual_sales_amount > 0),
            md5(string_agg(f.row_hash, ',' ORDER BY f.id))
       FROM m1.income_projection p
       JOIN m1.income_fact f ON f.id = p.income_fact_id
      WHERE p.mapping_version_id = $1
      GROUP BY p.standard_work_id`,
    [mapping.mappingVersionId]
  );
  await client.query(
    `INSERT INTO m1.mapping_version_work_form_metric
       (mapping_version_id, standard_work_id, business_form,
        first_positive_sale_month, positive_fact_count, source_projection_checksum)
     SELECT $1, p.standard_work_id, p.business_form,
            min(f.bill_month) FILTER (WHERE f.actual_sales_amount > 0),
            count(*) FILTER (WHERE f.actual_sales_amount > 0),
            md5(string_agg(f.row_hash, ',' ORDER BY f.id))
       FROM m1.income_projection p
       JOIN m1.income_fact f ON f.id = p.income_fact_id
      WHERE p.mapping_version_id = $1
      GROUP BY p.standard_work_id, p.business_form`,
    [mapping.mappingVersionId]
  );
  return projected;
}

async function validateAndActivateMapping(client, payload, mapping, basicInfo) {
  const { importBatchId } = mapping.batch;
  await client.query(
    `UPDATE m1.mapping_version
        SET status = 'validated', projection_row_count = $2,
            projection_total_amount = $3, projection_checksum = $4,
            validated_at = clock_timestamp()
      WHERE id = $1`,
    [
      mapping.mappingVersionId,
      payload.factImport.factRowCount,
      payload.factImport.factTotalAmount,
      payload.factImport.factChecksum
    ]
  );
  await client.query(
    `UPDATE m1.import_batch
        SET status = 'ready',
            accepted_row_count = $2,
            fact_row_count = $2,
            projection_row_count = $2,
            deleted_confirmed_amount = 0,
            accepted_total_amount = $3,
            fact_total_amount = $3,
            projection_total_amount = $3,
            reconciliation_checksum = $4,
            reconciled_at = clock_timestamp()
      WHERE id = $1`,
    [
      importBatchId,
      payload.factImport.factRowCount,
      payload.factImport.factTotalAmount,
      payload.factImport.factChecksum
    ]
  );
  await client.query("SELECT m1.assert_mapping_coverage($1, $2, NULL)", [
    mapping.mappingVersionId,
    importBatchId
  ]);
  await client.query(
    `INSERT INTO m1.restore_point
       (restore_point_no, operation_type, operation_ref, database_backup_ref,
        mapping_version_id, basic_info_version_id, import_batch_id,
        checksum_payload, created_by)
     VALUES ($1, 'batch_activate', $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      `M2-FORMAL-${payload.payloadHash.slice(0, 16)}`,
      payload.payloadHash,
      `private-local-dump:${basename(BACKUP_PATH)}`,
      mapping.mappingVersionId,
      basicInfo.basicInfoVersionId,
      importBatchId,
      JSON.stringify({
        payloadHash: payload.payloadHash,
        backupSha256: await hashFile(BACKUP_PATH),
        factChecksum: payload.factImport.factChecksum
      }),
      ACTOR
    ]
  );
  await client.query("SELECT m1.activate_bill_batch($1, $2, $3)", [
    importBatchId,
    mapping.mappingVersionId,
    ACTOR
  ]);
  await client.query("SELECT m1.switch_basic_info_version($1, $2)", [
    basicInfo.basicInfoVersionId,
    ACTOR
  ]);
}

async function insertAuditEvent(client, payload, taskId, eventType, eventPayload, exportId = null) {
  const eventKey = `${eventType}:${payload.payloadHash}:${exportId ?? "task"}`;
  await client.query(
    `INSERT INTO m1.m2_formal_audit_events
       (event_key, task_id, export_package_id, event_type, actor, event_payload_json)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT(event_key) DO NOTHING`,
    [eventKey, taskId, exportId, eventType, ACTOR, JSON.stringify(eventPayload)]
  );
}

async function insertFormalEvaluation(client, payload, taskId, mapping, basicInfo) {
  const cutoffMonth = `${payload.latestCompleteMonth}-01`;
  await client.query(
    `INSERT INTO m1.m2_evaluation_algorithm_versions
       (version_key, candidate_version, parameter_version, status, is_formal,
        source_candidate, description, frozen_at, audit_metadata_json)
     VALUES ($1, $2, $3, 'frozen', false, $2,
             'Authorized local formal-evaluation run; conditional candidate is not release-approved.',
             clock_timestamp(), $4::jsonb)`,
    [
      payload.algorithmVersion,
      payload.candidateVersion,
      payload.parameterVersion,
      JSON.stringify({
        payloadHash: payload.payloadHash,
        modelValidation: payload.summary.modelValidation,
        finalReleaseApproved: false,
        operatingSuggestionsIncluded: false
      })
    ]
  );
  await insertAuditEvent(client, payload, taskId, "formal_evaluation_started", {
    workCount: payload.records.length,
    candidateVersion: payload.candidateVersion
  });
  const resultRows = await insertRows(
    client,
    "m1.m2_evaluation_results",
    [
      "standard_work_id",
      "candidate_version",
      "algorithm_version",
      "parameter_version",
      "mapping_version_id",
      "basic_info_version_id",
      "cutoff_month",
      "result_status",
      "rating",
      "lifecycle",
      "lifecycle_confidence",
      "forecast_base_total",
      "forecast_optimistic_total",
      "forecast_pessimistic_total",
      "forecast_range_lower",
      "forecast_range_upper",
      "risk_level",
      "primary_suggestion",
      "not_for_formal_decision",
      "formal_evaluation_allowed",
      "generated_at",
      "forecastability_status",
      "forecast_confidence",
      "selected_forecast_model",
      "evaluation_metadata_json"
    ],
    payload.records.map((row) => [
      row.standardWorkId,
      payload.candidateVersion,
      payload.algorithmVersion,
      payload.parameterVersion,
      mapping.mappingVersionId,
      basicInfo.basicInfoVersionId,
      cutoffMonth,
      "current",
      row.rating,
      row.lifecycle,
      row.lifecycleConfidence,
      row.forecastBaseTotal,
      row.forecastOptimisticTotal,
      row.forecastPessimisticTotal,
      row.forecastPessimisticTotal,
      row.forecastOptimisticTotal,
      row.riskLevel,
      null,
      true,
      false,
      payload.generatedAt,
      row.forecastabilityStatus,
      row.forecastConfidence,
      row.selectedForecastModel,
      row.evaluationMetadata
    ]),
    { returning: "id, standard_work_id" }
  );
  const resultIds = new Map(resultRows.map((row) => [row.standard_work_id, row.id]));

  await insertRows(
    client,
    "m1.m2_evaluation_input_snapshots",
    [
      "evaluation_result_id",
      "standard_work_id",
      "cutoff_month",
      "latest_complete_month",
      "income_fact_version",
      "source_batch_ids",
      "mapping_version_id",
      "basic_info_version_id",
      "copyright_start",
      "copyright_end",
      "remaining_copyright_months",
      "last3_revenue",
      "last6_revenue",
      "last12_revenue",
      "last24_revenue",
      "total_historical_revenue",
      "active_month_count",
      "zero_revenue_month_count",
      "business_form_breakdown",
      "channel_concentration_summary",
      "incomplete_months_excluded",
      "input_hash",
      "copyright_end_type",
      "copyright_end_value",
      "work_status",
      "audio_rights_status",
      "classification_path_json",
      "auxiliary_tags_json",
      "snapshot_metadata_json"
    ],
    payload.records.map((row) => [
      resultIds.get(row.standardWorkId),
      row.standardWorkId,
      cutoffMonth,
      cutoffMonth,
      mapping.batch.batchNo,
      [mapping.batch.importBatchId],
      mapping.mappingVersionId,
      basicInfo.basicInfoVersionId,
      row.copyrightStart,
      row.copyrightEnd,
      row.remainingCopyrightMonths,
      row.last3Revenue,
      row.last6Revenue,
      row.last12Revenue,
      row.last24Revenue,
      row.totalHistoricalRevenue,
      row.activeMonthCount,
      row.zeroRevenueMonthCount,
      row.businessFormBreakdown,
      row.channelConcentrationSummary,
      payload.factImport.monthly
        .filter((item) => item.billMonth > cutoffMonth)
        .map((item) => item.billMonth),
      row.inputHash,
      row.copyrightEndType,
      row.copyrightEndValue,
      row.workStatus,
      row.audioRightsStatus,
      JSON.stringify(row.classificationPath),
      JSON.stringify(row.auxiliaryTags),
      {
        reviewDecisionStatus: row.reviewDecisionStatus,
        finalReleaseApproved: false,
        operatingSuggestionsIncluded: false
      }
    ])
  );

  const riskRows = payload.records.flatMap((row) =>
    [...new Set(row.riskCodes ?? [])].map((riskCode) => [
      resultIds.get(row.standardWorkId),
      riskCode,
      ["low", "medium", "high"].includes(row.riskLevel) ? row.riskLevel : "low",
      "warning",
      false,
      false,
      {
        forecastabilityStatus: row.forecastabilityStatus,
        source: "formal_evaluation_aggregate"
      },
      "Display as a factual risk or review prompt; no automatic operating action."
    ])
  );
  await insertRows(
    client,
    "m1.m2_evaluation_risks",
    [
      "evaluation_result_id",
      "risk_code",
      "severity",
      "risk_type",
      "is_blocking",
      "is_advisory",
      "evidence_json",
      "mitigation_hint"
    ],
    riskRows
  );

  const reviewRows = payload.records.flatMap((row) =>
    (row.businessReviewAdvisories ?? []).map((advisory) => [
      resultIds.get(row.standardWorkId),
      row.standardWorkId,
      "advisory_review",
      `post_foundation_advisory_${stableHash(advisory).slice(0, 16)}`,
      "no_action_required",
      100,
      false,
      "user_confirmed",
      payload.generatedAt,
      "accepted_as_advisory",
      "User-confirmed business review retained as a factual advisory.",
      {
        advisoryHash: stableHash(advisory),
        operatingActionGenerated: false
      }
    ])
  );
  await insertRows(
    client,
    "m1.m2_evaluation_review_items",
    [
      "evaluation_result_id",
      "standard_work_id",
      "review_type",
      "review_reason_code",
      "review_status",
      "review_priority",
      "is_blocking",
      "reviewed_by",
      "reviewed_at",
      "decision",
      "decision_reason",
      "audit_metadata_json"
    ],
    reviewRows
  );
  await insertAuditEvent(client, payload, taskId, "formal_evaluation_completed", {
    resultCount: resultRows.length,
    inputSnapshotCount: payload.records.length,
    riskCount: riskRows.length,
    advisoryReviewCount: reviewRows.length,
    suggestionCount: 0,
    finalReleaseApproved: false
  });
  return { resultIds, resultCount: resultRows.length, riskCount: riskRows.length, reviewCount: reviewRows.length };
}

async function prepareExportPackage(client, payload, taskId, mapping, basicInfo, evaluation) {
  const exportKey = `M2-FORMAL-${payload.payloadHash.slice(0, 16)}`;
  const packageRow = await client.query(
    `INSERT INTO m1.m2_formal_export_packages
       (export_key, task_id, candidate_version, algorithm_version,
        mapping_version_id, basic_info_version_id, cutoff_month, status,
        contains_operating_suggestions, audit_metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'building', false, $8::jsonb)
     RETURNING id`,
    [
      exportKey,
      taskId,
      payload.candidateVersion,
      payload.algorithmVersion,
      mapping.mappingVersionId,
      basicInfo.basicInfoVersionId,
      `${payload.latestCompleteMonth}-01`,
      JSON.stringify({
        payloadHash: payload.payloadHash,
        modelVerdict: payload.summary.modelValidation.verdict,
        finalReleaseApproved: false,
        releaseBlocker: "conditional_model_requires_final_user_acceptance"
      })
    ]
  );
  const exportPackageId = packageRow.rows[0].id;
  const items = payload.records.map((row) => [
    exportPackageId,
    evaluation.resultIds.get(row.standardWorkId),
    row.standardWorkId,
    stableHash({
      standardWorkId: row.standardWorkId,
      inputHash: row.inputHash,
      rating: row.rating,
      lifecycle: row.lifecycle,
      forecastabilityStatus: row.forecastabilityStatus,
      forecastBaseTotal: row.forecastBaseTotal,
      riskCodes: row.riskCodes
    })
  ]);
  await insertRows(
    client,
    "m1.m2_formal_export_items",
    ["export_package_id", "evaluation_result_id", "standard_work_id", "item_hash"],
    items
  );
  const packageHash = stableHash(items.map((row) => row[3]));
  await client.query(
    `UPDATE m1.m2_formal_export_packages
        SET status = 'prepared', item_count = $2, payload_hash = $3,
            generated_at = clock_timestamp(), updated_at = clock_timestamp(),
            release_note = 'Prepared for final user acceptance; not released.'
      WHERE id = $1`,
    [exportPackageId, items.length, packageHash]
  );
  await insertAuditEvent(
    client,
    payload,
    taskId,
    "export_prepared",
    {
      itemCount: items.length,
      packageHash,
      containsOperatingSuggestions: false,
      status: "prepared",
      finalReleaseApproved: false
    },
    exportPackageId
  );
  return { exportPackageId, exportKey, packageHash, status: "prepared" };
}

async function completeTask(client, payload, taskId, execution) {
  await client.query(
    `UPDATE m1.background_task
        SET status = 'succeeded', finished_at = clock_timestamp(), result = $2::jsonb
      WHERE id = $1`,
    [
      taskId,
      JSON.stringify({
        payloadHash: payload.payloadHash,
        workCount: execution.evaluation.resultCount,
        factRowCount: payload.factImport.factRowCount,
        mappingVersionId: execution.mapping.mappingVersionId,
        basicInfoVersionId: execution.basicInfo.basicInfoVersionId,
        exportPackageId: execution.exportPackage.exportPackageId,
        exportStatus: execution.exportPackage.status,
        finalReleaseApproved: false,
        operatingSuggestionsIncluded: false
      })
    ]
  );
  await client.query(
    `INSERT INTO m1.background_task_event
       (task_id, event_type, from_status, to_status, message, event_payload, created_by)
     VALUES ($1, 'formal_execution_completed', 'running', 'succeeded',
             'Authorized local M2 formal evaluation completed; release remains unapproved.',
             $2::jsonb, $3)`,
    [
      taskId,
      JSON.stringify({
        exportStatus: execution.exportPackage.status,
        finalReleaseApproved: false
      }),
      ACTOR
    ]
  );
}

async function strictReconciliation(client, payload) {
  const result = await client.query(
    `SELECT
       (SELECT count(*)::int FROM m1.income_fact) AS "incomeFacts",
       (SELECT count(*)::int FROM m1.income_projection p
         JOIN m1.mapping_version mv ON mv.id = p.mapping_version_id
        WHERE mv.status = 'active') AS "activeProjections",
       (SELECT count(DISTINCT p.standard_work_id)::int FROM m1.income_projection p
         JOIN m1.mapping_version mv ON mv.id = p.mapping_version_id
        WHERE mv.status = 'active') AS "projectedWorks",
       (SELECT coalesce(sum(actual_sales_amount), 0)::text FROM m1.income_fact) AS "factTotal",
       (SELECT coalesce(sum(f.actual_sales_amount), 0)::text
          FROM m1.income_projection p
          JOIN m1.income_fact f ON f.id = p.income_fact_id
          JOIN m1.mapping_version mv ON mv.id = p.mapping_version_id
         WHERE mv.status = 'active') AS "projectionTotal",
       (SELECT count(*)::int FROM m1.basic_info_version_work w
         JOIN m1.basic_info_version v ON v.id = w.basic_info_version_id
        WHERE v.status = 'active') AS "basicInfoWorks",
       (SELECT count(*)::int FROM m1.work_classification_assignment a
         JOIN m1.basic_info_version v ON v.id = a.basic_info_version_id
        WHERE v.status = 'active') AS "classificationAssignments",
       (SELECT count(*)::int FROM m1.m2_evaluation_results
        WHERE candidate_version = $1 AND result_status = 'current') AS "evaluationResults",
       (SELECT count(*)::int FROM m1.m2_evaluation_input_snapshots s
         JOIN m1.m2_evaluation_results r ON r.id = s.evaluation_result_id
        WHERE r.candidate_version = $1 AND r.result_status = 'current') AS "inputSnapshots",
       (SELECT count(*)::int FROM m1.m2_evaluation_suggestions s
         JOIN m1.m2_evaluation_results r ON r.id = s.evaluation_result_id
        WHERE r.candidate_version = $1) AS "suggestions",
       (SELECT count(*)::int FROM m1.m2_evaluation_review_items i
         JOIN m1.m2_evaluation_results r ON r.id = i.evaluation_result_id
        WHERE r.candidate_version = $1 AND i.is_blocking = true
          AND i.review_status IN ('pending','data_fix_required','rejected_for_formal')) AS "blockingReviews",
       (SELECT count(*)::int FROM m1.m2_formal_export_items i
         JOIN m1.m2_formal_export_packages p ON p.id = i.export_package_id
        WHERE p.candidate_version = $1) AS "exportItems",
       (SELECT count(*)::int FROM m1.m2_formal_export_packages
        WHERE candidate_version = $1) AS "exportPackages",
       (SELECT count(*)::int FROM m1.m2_formal_export_packages
        WHERE candidate_version = $1 AND status = 'released') AS "releasedPackages",
       (SELECT count(*)::int FROM m1.m2_formal_audit_events e
         JOIN m1.m2_formal_export_packages p ON p.task_id = e.task_id
        WHERE p.candidate_version = $1) AS "auditEvents",
       (SELECT count(*)::int FROM m1.background_task t
         JOIN m1.m2_formal_export_packages p ON p.task_id = t.id
        WHERE p.candidate_version = $1 AND t.status = 'succeeded') AS "succeededTasks",
       (SELECT count(*)::int FROM m1.m2_evaluation_results
        WHERE candidate_version = $1 AND result_status = 'current'
          AND formal_evaluation_allowed = true) AS "formalAllowedResults",
       (SELECT count(*)::int FROM m1.m2_evaluation_results
        WHERE candidate_version = $1 AND result_status = 'current'
          AND not_for_formal_decision = true) AS "notForFormalResults",
       (SELECT status FROM m1.m2_evaluation_algorithm_versions
        WHERE version_key = (SELECT algorithm_version
          FROM m1.m2_formal_export_packages
          WHERE candidate_version = $1 ORDER BY id DESC LIMIT 1)) AS "algorithmStatus",
       (SELECT is_formal FROM m1.m2_evaluation_algorithm_versions
        WHERE version_key = (SELECT algorithm_version
          FROM m1.m2_formal_export_packages
          WHERE candidate_version = $1 ORDER BY id DESC LIMIT 1)) AS "algorithmFormal",
       (SELECT status FROM m1.m2_formal_export_packages
        WHERE candidate_version = $1 ORDER BY id DESC LIMIT 1) AS "exportStatus",
       (SELECT lifecycle_status FROM m1.system_state WHERE id = 1) AS "lifecycleStatus",
       (SELECT count(*)::int FROM m1.mapping_version WHERE status = 'active') AS "activeMappingVersions",
       (SELECT count(*)::int FROM m1.basic_info_version WHERE status = 'active') AS "activeBasicInfoVersions"`,
    [payload.candidateVersion]
  );
  const actual = result.rows[0];
  const checks = {
    factRowsMatch: Number(actual.incomeFacts) === payload.factImport.factRowCount,
    projectionRowsMatch: Number(actual.activeProjections) === payload.factImport.factRowCount,
    projectedWorksMatch: Number(actual.projectedWorks) === payload.records.length,
    amountsMatch: actual.factTotal === actual.projectionTotal,
    sourceAmountMatch: decimalEqual(actual.factTotal, payload.factImport.factTotalAmount),
    basicInfoWorksMatch: Number(actual.basicInfoWorks) === payload.records.length,
    classificationAssignmentsMatch:
      Number(actual.classificationAssignments) === payload.records.length,
    evaluationResultsMatch: Number(actual.evaluationResults) === payload.records.length,
    inputSnapshotsMatch: Number(actual.inputSnapshots) === payload.records.length,
    noOperatingSuggestions: Number(actual.suggestions) === 0,
    noOpenBlockingReviews: Number(actual.blockingReviews) === 0,
    exportItemsMatch: Number(actual.exportItems) === payload.records.length,
    oneExportPackage: Number(actual.exportPackages) === 1,
    noReleasedPackage: Number(actual.releasedPackages) === 0,
    auditEventChainComplete: Number(actual.auditEvents) === 7,
    formalTaskSucceeded: Number(actual.succeededTasks) === 1,
    algorithmFrozenConditional:
      actual.algorithmStatus === "frozen" && actual.algorithmFormal === false,
    formalFlagsRemainUnapproved:
      Number(actual.formalAllowedResults) === 0 &&
      Number(actual.notForFormalResults) === payload.records.length,
    exportPreparedNotReleased: actual.exportStatus === "prepared",
    lifecycleOperational: actual.lifecycleStatus === "operational",
    oneActiveMappingVersion: Number(actual.activeMappingVersions) === 1,
    oneActiveBasicInfoVersion: Number(actual.activeBasicInfoVersions) === 1
  };
  return {
    passed: Object.values(checks).every(Boolean),
    checks,
    counts: {
      incomeFacts: Number(actual.incomeFacts),
      activeProjections: Number(actual.activeProjections),
      projectedWorks: Number(actual.projectedWorks),
      basicInfoWorks: Number(actual.basicInfoWorks),
      classificationAssignments: Number(actual.classificationAssignments),
      evaluationResults: Number(actual.evaluationResults),
      inputSnapshots: Number(actual.inputSnapshots),
      suggestions: Number(actual.suggestions),
      blockingReviews: Number(actual.blockingReviews),
      exportItems: Number(actual.exportItems),
      exportPackages: Number(actual.exportPackages),
      releasedPackages: Number(actual.releasedPackages),
      auditEvents: Number(actual.auditEvents),
      succeededTasks: Number(actual.succeededTasks),
      formalAllowedResults: Number(actual.formalAllowedResults),
      notForFormalResults: Number(actual.notForFormalResults)
    },
    exportStatus: actual.exportStatus,
    lifecycleStatus: actual.lifecycleStatus
  };
}

function decimalEqual(left, right) {
  const normalize = (value) => {
    const [integer, fraction = ""] = String(value).split(".");
    return `${integer}.${fraction.replace(/0+$/, "")}`;
  };
  return normalize(left) === normalize(right);
}

async function existingExecution(client, payload) {
  const result = await client.query(
    `SELECT id, status
       FROM m1.m2_formal_export_packages
      WHERE audit_metadata_json ->> 'payloadHash' = $1
      ORDER BY id DESC LIMIT 1`,
    [payload.payloadHash]
  );
  return result.rows[0] ?? null;
}

async function applyExecution(client, payload, factFile) {
  if (!existsSync(BACKUP_PATH) || statSync(BACKUP_PATH).size === 0) {
    throw new Error("Private pre-apply pg_dump is required before --apply.");
  }
  const existing = await existingExecution(client, payload);
  if (existing) {
    progress("matching execution already exists; returning idempotent reconciliation summary");
    return strictReconciliation(client, payload);
  }
  const preflight = await inspectDatabase(client);
  if (
    Number(preflight.counts.incomeFacts) !== 0 ||
    Number(preflight.counts.evaluationResults) !== 0 ||
    Number(preflight.counts.exportPackages) !== 0
  ) {
    throw new Error("Local database contains an unrelated partial execution; refusing to mix scopes.");
  }

  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await ensureBootstrap(client);
    const taskId = await createExecutionTask(client, payload);
    const versions = await createClassificationAndTagVersions(client, payload, taskId);
    progress("writing the 3053-work formal basic-info version");
    const basicInfo = await createBasicInfoVersion(client, payload, versions);
    const batch = await createImportBatch(client, payload, taskId);
    progress("importing private income facts into the isolated local database");
    await importIncomeFacts(client, payload, factFile, batch);
    progress("building and validating the formal mapping version");
    const mapping = await createMappingVersion(client, payload, taskId, batch);
    await createProjections(client, payload, factFile, mapping);
    await validateAndActivateMapping(client, payload, mapping, basicInfo);
    await insertAuditEvent(client, payload, taskId, "formal_input_verified", {
      workCount: payload.records.length,
      reviewDecisionPending: payload.reviewDecisionSummary.pending,
      operatingSuggestionsIncluded: false
    });
    await insertAuditEvent(client, payload, taskId, "formal_master_data_written", {
      workCount: payload.records.length,
      basicInfoVersionId: basicInfo.basicInfoVersionId,
      snapshotChecksum: basicInfo.snapshotChecksum
    });
    await insertAuditEvent(client, payload, taskId, "mapping_validated", {
      mappingVersionId: mapping.mappingVersionId,
      projectionRowCount: payload.factImport.factRowCount,
      factChecksum: payload.factImport.factChecksum
    });
    await insertAuditEvent(client, payload, taskId, "mapping_activated", {
      mappingVersionId: mapping.mappingVersionId,
      importBatchId: batch.importBatchId,
      activationMethod: "activate_bill_batch"
    });
    progress("writing DB-backed formal evaluation results and immutable input snapshots");
    const evaluation = await insertFormalEvaluation(
      client,
      payload,
      taskId,
      mapping,
      basicInfo
    );
    const exportPackage = await prepareExportPackage(
      client,
      payload,
      taskId,
      mapping,
      basicInfo,
      evaluation
    );
    await completeTask(client, payload, taskId, {
      mapping,
      basicInfo,
      evaluation,
      exportPackage
    });
    const reconciliation = await strictReconciliation(client, payload);
    if (!reconciliation.passed) {
      throw new Error(`Strict reconciliation failed: ${JSON.stringify(reconciliation.checks)}`);
    }
    await client.query("COMMIT");
    return reconciliation;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function loadCurrentSummary(client, payload) {
  const database = await inspectDatabase(client);
  const existing = await existingExecution(client, payload);
  if (!existing) {
    return { exists: false, database };
  }
  return {
    exists: true,
    database,
    reconciliation: await strictReconciliation(client, payload)
  };
}

function buildPublicSummary(payload, database, reconciliation, mode) {
  return {
    schema: "m2.formal_local_execution_summary.v1",
    generatedAt: new Date().toISOString(),
    mode,
    environment: {
      localIsolatedDatabase: true,
      postgresMajorVersion: 16,
      flywaySchemaVersion: database.schemaVersion,
      remoteProductionOrSharedDatabaseConnected: false
    },
    input: {
      workCount: payload.records.length,
      factRowCount: payload.factImport.factRowCount,
      reviewDecisionCount: payload.reviewDecisionSummary.total,
      reviewDecisionPendingCount: payload.reviewDecisionSummary.pending,
      scopeFullyAligned: payload.scopeReconciliation.scopeFullyAligned,
      audioRightsStatusDistribution: payload.summary.audioRightsStatusDistribution,
      copyrightEndTypeDistribution: payload.summary.copyrightEndTypeDistribution,
      rightsTermStatusConflictCount: payload.summary.rightsTermStatusConflictCount,
      copyrightChronologyInvalidCount: 0,
      operatingSuggestionsIncluded: false
    },
    versions: {
      candidateVersion: payload.candidateVersion,
      algorithmVersion: payload.algorithmVersion,
      parameterVersion: payload.parameterVersion,
      algorithmStatus: payload.algorithmStatus
    },
    modelValidation: payload.summary.modelValidation,
    formalExecution: {
      formalMasterDataWritten: mode === "applied",
      mappingActivated: mode === "applied",
      formalEvaluationExecuted: mode === "applied",
      dbBackedExportPrepared: mode === "applied",
      finalReleaseApproved: false,
      exportStatus: reconciliation?.exportStatus ?? "not_created",
      m2FormalReleaseComplete: false,
      m3FormalExecutionAllowed: false
    },
    strictReconciliation: reconciliation ?? null,
    remainingHumanDecision: {
      required: mode === "applied",
      code: mode === "applied" ? "final_algorithm_and_release_acceptance" : "run_apply_after_dry_run",
      reason:
        mode === "applied"
          ? "The v1.1 candidate remains CONDITIONAL PASS and the prepared export is not release-approved."
          : "Dry-run does not write formal state."
    },
    safety: {
      rawRowsIncludedInReport: false,
      realTitlesIncludedInReport: false,
      authorNamesIncludedInReport: false,
      channelNamesIncludedInReport: false,
      secretsIncludedInReport: false,
      operatingSuggestionsIncluded: false,
      privateOutputsTrackedByGit: false
    }
  };
}

function writeReports(summary) {
  writeFileSync(REPORT_JSON, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  const checks = summary.strictReconciliation?.checks ?? {};
  const lines = [
    "# M2 本地正式执行汇总 v1",
    "",
    "## 结论",
    "",
    `- 执行模式：\`${summary.mode}\`。`,
    `- 正式基础信息写入：\`${summary.formalExecution.formalMasterDataWritten}\`。`,
    `- mapping activation：\`${summary.formalExecution.mappingActivated}\`。`,
    `- formal evaluation：\`${summary.formalExecution.formalEvaluationExecuted}\`。`,
    `- DB-backed export：\`${summary.formalExecution.exportStatus}\`。`,
    "- 自动运营建议：`0`，正式输出继续禁止运营动作建议。",
    `- 最终发布批准：\`${summary.formalExecution.finalReleaseApproved}\`。`,
    `- M3 formal execution：\`${summary.formalExecution.m3FormalExecutionAllowed}\`。`,
    "",
    "## 输入与模型",
    "",
    `- 标准作品：\`${summary.input.workCount}\`。`,
    `- 收入事实：\`${summary.input.factRowCount}\`。`,
    `- 业务复核：\`${summary.input.reviewDecisionCount}\` 条，待确认 \`${summary.input.reviewDecisionPendingCount}\`。`,
    `- 期限/当前权利状态冲突：\`${summary.input.rightsTermStatusConflictCount}\`；到期早于开始：\`${summary.input.copyrightChronologyInvalidCount}\`。`,
    `- 模型结论：\`${summary.modelValidation.verdict}\`。`,
    `- WAPE：\`${summary.modelValidation.wape}\`；baseline：\`${summary.modelValidation.baselineWape}\`。`,
    `- 区间覆盖率：\`${summary.modelValidation.intervalCoverage}\`；P0/P1/P2：\`${summary.modelValidation.p0}/${summary.modelValidation.p1}/${summary.modelValidation.p2}\`。`,
    `- 可预测收入覆盖：\`${summary.modelValidation.forecastableRevenueShare}\`；true blocked 收入占比：\`${summary.modelValidation.trueBlockedRevenueShare}\`。`,
    "",
    "## 严格对账",
    "",
    "| 检查项 | 结果 |",
    "|---|---|",
    `| 总体通过 | \`${summary.strictReconciliation?.passed ?? false}\` |`,
    ...Object.entries(checks).map(([key, value]) => `| ${key} | \`${value}\` |`),
    "",
    "## 下一人工门禁",
    "",
    "- 需要用户对 v1.1 conditional 的算法接受边界和 prepared export 做最终接受决定。",
    "- 在该决定前，export 不得变为 released，M2 不得称为最终正式发布完成，M3 formal execution 仍不启动。",
    "",
    "## 安全边界",
    "",
    "- 本报告只包含脱敏聚合；不包含作品名、作者名、渠道名、原始账单行或连接凭据。",
    "- private payload、NDJSON、模型缓存和本地 dump 均位于 Git 忽略目录，不进入版本控制。",
    ""
  ];
  writeFileSync(REPORT_MD, lines.join("\n"), "utf8");
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const payload = loadPayload();
  const validation = validateFormalExecutionPayload(payload);
  if (!validation.valid) {
    throw new Error(`Formal execution payload rejected: ${validation.issues.join(", ")}`);
  }
  progress("validating the private fact file without printing row-level data");
  const factFile = await validateFactFile(payload);
  const config = localConfig(readDotEnv(join(ROOT, ".env.local")));
  const client = databaseClient(config);
  await client.connect();
  try {
    const database = await inspectDatabase(client);
    assertDatabaseBoundary(config, database);
    if (args.dryRun) {
      const summary = buildPublicSummary(payload, database, null, "dry_run");
      return {
        dryRun: true,
        payloadValid: true,
        factFileValid: true,
        workCount: validation.workCount,
        factRowCount: factFile.rowCount,
        schemaVersion: database.schemaVersion,
        databaseWritten: false,
        mappingActivated: false,
        formalEvaluationExecuted: false,
        finalReleaseApproved: false,
        operatingSuggestionsIncluded: false,
        summary
      };
    }
    if (args.summary) {
      const current = await loadCurrentSummary(client, payload);
      return {
        summary: true,
        executionExists: current.exists,
        schemaVersion: current.database.schemaVersion,
        reconciliation: current.reconciliation ?? null,
        finalReleaseApproved: false,
        operatingSuggestionsIncluded: false
      };
    }
    progress("starting one transactional local formal execution");
    const reconciliation = await applyExecution(client, payload, factFile);
    const after = await inspectDatabase(client);
    const summary = buildPublicSummary(payload, after, reconciliation, "applied");
    writeReports(summary);
    return {
      applied: true,
      schemaVersion: after.schemaVersion,
      reconciliation,
      exportStatus: reconciliation.exportStatus,
      finalReleaseApproved: false,
      m2FormalReleaseComplete: false,
      m3FormalExecutionAllowed: false,
      operatingSuggestionsIncluded: false,
      reports: [
        "docs/analysis/m2-real-data/M2-formal-local-execution-summary-v1.md",
        "docs/analysis/m2-real-data/M2-formal-local-execution-summary-v1.json"
      ]
    };
  } finally {
    await client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`[m2-formal-db] ERROR: ${error.message}\n`);
      process.exitCode = 1;
    });
}
