import { loadConfig } from "../config.js";
import { checkDatabaseHealth } from "../db/health.js";
import { publicErrorBody } from "../errors.js";

try {
  const config = loadConfig();
  const result = await checkDatabaseHealth(config);
  console.log(JSON.stringify({ service: config.service, ...result }, null, 2));
  process.exitCode = result.status === "ok" ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify(publicErrorBody(error), null, 2));
  process.exitCode = 1;
}
