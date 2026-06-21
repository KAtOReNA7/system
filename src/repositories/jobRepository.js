import { withDatabaseClient } from "../db/query.js";

const STATUS_MAP = {
  queued: "pending",
  running: "running",
  waiting: "blocked",
  succeeded: "succeeded",
  failed: "failed",
  cancelled: "cancelled"
};

export async function listJobs(config, pagination, options = {}) {
  return withDatabaseClient(
    config.database.backgroundUrl,
    "background_worker",
    "m1_jobs_readonly",
    async (client) => {
      const count = await client.query("SELECT count(*)::int AS total FROM m1.background_task");
      const rows = await client.query(
        `SELECT id, task_type, logical_operation_key, status, created_at, started_at, finished_at
           FROM m1.background_task
          ORDER BY id DESC
          LIMIT $1 OFFSET $2`,
        [pagination.pageSize, (pagination.page - 1) * pagination.pageSize]
      );

      return {
        items: rows.rows.map(toJobSummary),
        pagination: {
          page: pagination.page,
          pageSize: pagination.pageSize,
          total: count.rows[0]?.total ?? 0
        }
      };
    },
    options
  );
}

export async function getJobById(config, id, options = {}) {
  return withDatabaseClient(
    config.database.backgroundUrl,
    "background_worker",
    "m1_job_readonly",
    async (client) => {
      const rows = await client.query(
        `SELECT id, task_type, logical_operation_key, status, created_at, started_at, finished_at
           FROM m1.background_task
          WHERE id = $1
          LIMIT 1`,
        [id]
      );

      return rows.rows[0] ? toJobSummary(rows.rows[0]) : null;
    },
    options
  );
}

export function toPublicJobStatus(databaseStatus) {
  return STATUS_MAP[databaseStatus] ?? "failed";
}

function toJobSummary(row) {
  return {
    id: String(row.id),
    type: row.task_type,
    logicalOperationKey: row.logical_operation_key,
    status: toPublicJobStatus(row.status),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    startedAt: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
    finishedAt: row.finished_at instanceof Date ? row.finished_at.toISOString() : row.finished_at
  };
}
