import { withDatabaseClient } from "../db/query.js";

export async function listMappingVersions(config, pagination, options = {}) {
  return withDatabaseClient(
    config.database.backgroundUrl,
    "background_worker",
    "m1_mapping_versions_readonly",
    async (client) => {
      const count = await client.query("SELECT count(*)::int AS total FROM m1.mapping_version");
      const rows = await client.query(
        `SELECT id, version_no, status, trigger_type, projection_row_count, created_at
           FROM m1.mapping_version
          ORDER BY id DESC
          LIMIT $1 OFFSET $2`,
        [pagination.pageSize, (pagination.page - 1) * pagination.pageSize]
      );

      return {
        items: rows.rows.map(toMappingVersionSummary),
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

export async function getMappingVersionById(config, id, options = {}) {
  return withDatabaseClient(
    config.database.backgroundUrl,
    "background_worker",
    "m1_mapping_version_readonly",
    async (client) => {
      const rows = await client.query(
        `SELECT id, version_no, status, trigger_type, projection_row_count, created_at
           FROM m1.mapping_version
          WHERE id = $1
          LIMIT 1`,
        [id]
      );

      return rows.rows[0] ? toMappingVersionSummary(rows.rows[0]) : null;
    },
    options
  );
}

function toMappingVersionSummary(row) {
  return {
    id: String(row.id),
    versionNo: Number(row.version_no),
    status: row.status,
    triggerType: row.trigger_type,
    projectionRowCount: Number(row.projection_row_count),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}
