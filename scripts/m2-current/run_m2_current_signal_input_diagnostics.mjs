#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

import {
  diagnoseM2CurrentSignalInputBundle,
  fingerprintM2CurrentSignalCasePopulation
} from "../../src/domain/m2Current/signalInputBundle.js";

const root = process.cwd();
const defaultBundleFile = path.join(
  root,
  "test/fixtures/m2-current-signal-input-bundle.synthetic.v0.1.json"
);
const defaultCaseFile = path.join(
  root,
  "test/fixtures/m2-current-signal-cases.synthetic.v0.1.ndjson"
);
const trackedOutputFile = path.join(
  root,
  "docs/analysis/m2-current/"
    + "M2-current-signal-input-portable-diagnostic-v0.1.json"
);
const options = parseArguments(process.argv.slice(2));
if (options.fingerprintCases) {
  runCaseFingerprint(options);
} else {
  runDiagnostic(options);
}

function runCaseFingerprint(runOptions) {
  if (
    runOptions.caseFile === null
    || runOptions.bundleFile !== null
    || runOptions.verify
    || runOptions.stdout
  ) {
    throw new Error(
      "m2_current_signal_input_case_fingerprint_arguments_invalid"
    );
  }
  const caseFile = resolveInputFile(runOptions.caseFile, ".ndjson");
  const bytes = readFileSync(caseFile);
  const rows = parseNdjson(bytes.toString("utf8"));
  process.stdout.write(`${JSON.stringify({
    schema: "m2.current.signal_case_fingerprint.public.v0.1",
    caseRowCount: rows.length,
    caseFileSha256: createHash("sha256").update(bytes).digest("hex"),
    casePopulationSha256:
      fingerprintM2CurrentSignalCasePopulation(rows),
    aggregateOnly: true,
    rowIdentifiersIncluded: false
  }, null, 2)}\n`);
}

function runDiagnostic(runOptions) {
  const customInput =
    runOptions.bundleFile !== null || runOptions.caseFile !== null;
  if (
    customInput
    && (runOptions.bundleFile === null || runOptions.caseFile === null)
  ) {
    throw new Error(
      "m2_current_signal_input_bundle_and_case_files_required_together"
    );
  }
  if (runOptions.verify && customInput) {
    throw new Error(
      "m2_current_signal_input_verify_custom_files_forbidden"
    );
  }

  const bundleFile = runOptions.bundleFile === null
    ? defaultBundleFile
    : resolveInputFile(runOptions.bundleFile, ".json");
  const caseFile = runOptions.caseFile === null
    ? defaultCaseFile
    : resolveInputFile(runOptions.caseFile, ".ndjson");
  const bundleInput = loadBundleInput(bundleFile);
  const caseBytes = readFileSync(caseFile);
  const caseRows = parseNdjson(caseBytes.toString("utf8"));
  verifyCaseBinding(bundleInput, caseBytes, caseRows.length);
  const diagnostic = diagnoseM2CurrentSignalInputBundle(
    caseRows,
    bundleInput
  );
  const output = `${JSON.stringify(diagnostic, null, 2)}\n`;

  if (runOptions.verify) {
    const tracked = readFileSync(trackedOutputFile, "utf8")
      .replaceAll("\r\n", "\n");
    if (tracked !== output) {
      throw new Error("m2_current_signal_input_diagnostic_output_drift");
    }
    process.stdout.write(
      "M2 current portable signal input diagnostic verified.\n"
    );
  } else if (customInput || runOptions.stdout) {
    process.stdout.write(output);
  } else {
    writeFileSync(trackedOutputFile, output, "utf8");
    process.stdout.write(
      "M2 current portable signal input diagnostic written: "
        + `${path.relative(root, trackedOutputFile)}\n`
    );
  }
}

function loadBundleInput(file) {
  const parsed = parseJsonFile(file);
  const hasInline = Array.isArray(parsed.facts) || Array.isArray(
    parsed.snapshots
  );
  const hasExternal = parsed.factFile !== undefined
    || parsed.snapshotFile !== undefined;
  if (hasInline && hasExternal) {
    throw new Error(
      "m2_current_signal_input_inline_and_external_rows_conflict"
    );
  }
  if (!hasExternal) {
    return parsed;
  }
  const directory = path.dirname(file);
  const facts = readBoundNdjson(directory, parsed, {
    fileField: "factFile",
    hashField: "factFileSha256",
    countField: "factRowCount",
    label: "facts"
  });
  const snapshots = readBoundNdjson(directory, parsed, {
    fileField: "snapshotFile",
    hashField: "snapshotFileSha256",
    countField: "snapshotRowCount",
    label: "snapshots"
  });
  return {
    ...parsed,
    facts,
    snapshots
  };
}

function readBoundNdjson(directory, manifest, fields) {
  const relativeFile = String(manifest[fields.fileField] ?? "");
  if (
    relativeFile === ""
    || path.isAbsolute(relativeFile)
    || path.extname(relativeFile).toLowerCase() !== ".ndjson"
  ) {
    throw new Error(
      `m2_current_signal_input_${fields.label}_file_invalid`
    );
  }
  const absoluteFile = path.resolve(directory, relativeFile);
  const relation = path.relative(directory, absoluteFile);
  if (
    relation === ""
    || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)
  ) {
    throw new Error(
      `m2_current_signal_input_${fields.label}_file_outside_bundle`
    );
  }
  const bytes = readFileSync(absoluteFile);
  const expectedHash = String(manifest[fields.hashField] ?? "")
    .toLowerCase();
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (expectedHash !== actualHash) {
    throw new Error(
      `m2_current_signal_input_${fields.label}_hash_mismatch`
    );
  }
  const rows = parseNdjson(bytes.toString("utf8"));
  if (
    !Number.isInteger(manifest[fields.countField])
    || manifest[fields.countField] !== rows.length
  ) {
    throw new Error(
      `m2_current_signal_input_${fields.label}_count_mismatch`
    );
  }
  return rows;
}

function verifyCaseBinding(bundle, bytes, rowCount) {
  const expectedHash = String(bundle?.caseFileSha256 ?? "").toLowerCase();
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (expectedHash !== actualHash) {
    throw new Error("m2_current_signal_input_cases_hash_mismatch");
  }
  if (
    !Number.isInteger(bundle?.caseRowCount)
    || bundle.caseRowCount !== rowCount
  ) {
    throw new Error("m2_current_signal_input_cases_count_mismatch");
  }
}

function parseNdjson(text) {
  const rows = [];
  const lines = String(text).split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "") {
      continue;
    }
    try {
      rows.push(JSON.parse(line));
    } catch {
      throw new Error(
        `m2_current_signal_input_ndjson_invalid_line_${index + 1}`
      );
    }
  }
  return rows;
}

function parseJsonFile(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error("m2_current_signal_input_bundle_json_invalid");
  }
}

function resolveInputFile(value, extension) {
  const resolved = path.resolve(root, String(value));
  if (path.extname(resolved).toLowerCase() !== extension) {
    throw new Error("m2_current_signal_input_file_extension_invalid");
  }
  return resolved;
}

function parseArguments(argumentsList) {
  const result = {
    bundleFile: null,
    caseFile: null,
    fingerprintCases: false,
    stdout: false,
    verify: false
  };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--verify") {
      result.verify = true;
    } else if (argument === "--fingerprint-cases") {
      result.fingerprintCases = true;
    } else if (argument === "--stdout") {
      result.stdout = true;
    } else if (argument === "--bundle-file") {
      result.bundleFile = requireArgumentValue(
        argumentsList,
        index,
        argument
      );
      index += 1;
    } else if (argument === "--case-file") {
      result.caseFile = requireArgumentValue(
        argumentsList,
        index,
        argument
      );
      index += 1;
    } else {
      throw new Error("m2_current_signal_input_argument_invalid");
    }
  }
  if (result.verify && result.stdout) {
    throw new Error(
      "m2_current_signal_input_verify_stdout_conflict"
    );
  }
  return result;
}

function requireArgumentValue(argumentsList, index, name) {
  const value = argumentsList[index + 1];
  if (
    value === undefined
    || value === ""
    || String(value).startsWith("--")
  ) {
    throw new Error(`m2_current_signal_input_${name.slice(2)}_required`);
  }
  return value;
}
