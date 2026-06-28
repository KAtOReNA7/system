import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateM3FieldCompletionPack } from "./apply_m3_field_completion_pack.js";
import { summarizeValidationIssues } from "../../src/domain/newProductEvaluation/fieldCompletionValidator.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const IS_CLI = path.resolve(process.argv[1] ?? "") === path.resolve(SCRIPT_PATH);

if (IS_CLI) {
  try {
    const result = validateM3FieldCompletionPack({ packPath: process.argv[2] });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const payload = error.validation
      ? {
          ok: false,
          code: error.code,
          message: error.message,
          validation: summarizeValidationIssues(error.validation.issues)
        }
      : {
          ok: false,
          code: error.code ?? "field_completion_validation_failed",
          message: error.message,
          candidates: error.candidates
        };
    process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exitCode = 1;
  }
}
