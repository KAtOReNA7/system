import { withDatabaseClient } from "../db/query.js";

export async function getSystemStatus(config, options = {}) {
  return withDatabaseClient(
    config.database.backgroundUrl,
    "background_worker",
    "m1_system_status",
    async (client) => {
      const state = await client.query(
        "SELECT lifecycle_status FROM m1.system_state WHERE id = 1"
      );
      const mapping = await client.query(
        "SELECT EXISTS (SELECT 1 FROM m1.mapping_version WHERE status = 'active') AS ready"
      );
      const billImport = await client.query(
        "SELECT EXISTS (SELECT 1 FROM m1.import_batch WHERE status = 'active') AS ready"
      );

      return {
        state: state.rows[0]?.lifecycle_status ?? null,
        mappingVersionReady: Boolean(mapping.rows[0]?.ready),
        billImportReady: Boolean(billImport.rows[0]?.ready)
      };
    },
    options
  );
}
