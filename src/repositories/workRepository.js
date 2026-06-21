import { withDatabaseClient } from "../db/query.js";

export async function listWorks(config, pagination, options = {}) {
  return withDatabaseClient(
    config.database.readonlyUrl,
    "application_ro",
    "m1_works_readonly",
    async (client) => {
      const count = await client.query("SELECT count(*)::int AS total FROM m1.v_basic_info_gap");
      const rows = await client.query(
        `SELECT standard_work_id,
                missing_basic_info_record,
                missing_core_fields,
                missing_classification
           FROM m1.v_basic_info_gap
          ORDER BY standard_work_id
          LIMIT $1 OFFSET $2`,
        [pagination.pageSize, (pagination.page - 1) * pagination.pageSize]
      );

      return {
        items: rows.rows.map(toWorkSummary),
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

export async function getWorkById(config, standardWorkId, options = {}) {
  return withDatabaseClient(
    config.database.readonlyUrl,
    "application_ro",
    "m1_work_readonly",
    async (client) => {
      const rows = await client.query(
        `SELECT standard_work_id,
                missing_basic_info_record,
                missing_core_fields,
                missing_classification
           FROM m1.v_basic_info_gap
          WHERE standard_work_id = $1
          LIMIT 1`,
        [standardWorkId]
      );

      return rows.rows[0] ? toWorkSummary(rows.rows[0]) : null;
    },
    options
  );
}

function toWorkSummary(row) {
  return {
    id: row.standard_work_id,
    standardWorkId: row.standard_work_id,
    completeness: {
      missingBasicInfoRecord: Boolean(row.missing_basic_info_record),
      missingCoreFields: Boolean(row.missing_core_fields),
      missingClassification: Boolean(row.missing_classification)
    }
  };
}
