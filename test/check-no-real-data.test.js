import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const guardScript = join(projectRoot, "scripts/check-no-real-data.mjs");
const syntheticSecret = "sk-synthetic11111111112222222222";

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function write(root, path, content) {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf8");
}

function writeBytes(root, path, bytes) {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, bytes);
}

function withSyntheticRepo(callback) {
  const root = mkdtempSync(join(tmpdir(), "m2-secret-guard-"));
  try {
    git(root, ["init", "--quiet"]);
    git(root, ["config", "user.name", "Synthetic Guard"]);
    git(root, ["config", "user.email", "synthetic-guard@example.invalid"]);
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runGuard(root) {
  return spawnSync(process.execPath, [guardScript], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env }
  });
}

function assertSecretIsNotEchoed(result) {
  assert.equal(`${result.stdout}${result.stderr}`.includes(syntheticSecret), false);
}

test("real-data guard accepts ordinary text, empty values, variable references, and explicit placeholders", () => {
  withSyntheticRepo((root) => {
    write(root, "README.md", "Synthetic repository with no private data.\n");
    write(root, ".env.example", [
      "OPENAI_API_KEY=${OPENAI_API_KEY}",
      "TAVILY_API_KEY=REDACTED",
      "M2_V2_RELAY_KEY=EXAMPLE_KEY",
      "PROVIDER_AUTHORIZATION=Bearer ${SYNTHETIC_TOKEN}",
      "EMPTY_VALUE=",
      ""
    ].join("\n"));
    git(root, ["add", "README.md", ".env.example"]);
    git(root, ["commit", "--quiet", "-m", "synthetic safe baseline"]);

    const result = runGuard(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /tracked\/staged\/nonignored-untracked paths/u);
  });
});

test("real-data guard rejects a tracked provider secret without echoing its value", () => {
  withSyntheticRepo((root) => {
    write(root, "config.txt", [
      `OPENAI_API_KEY=${syntheticSecret}`,
      `TAVILY_API_KEY=${syntheticSecret}`,
      `M2_V2_RELAY_KEY=${syntheticSecret}`,
      `Authorization: Bearer ${syntheticSecret}`,
      `rawAuthorization=${syntheticSecret}`,
      ""
    ].join("\n"));
    git(root, ["add", "config.txt"]);
    git(root, ["commit", "--quiet", "-m", "synthetic unsafe baseline"]);

    const result = runGuard(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /provider_key_value|secret_token_literal/u);
    for (const line of [1, 2, 3, 4, 5]) assert.match(result.stderr, new RegExp(`config\\.txt:${line}\\b`, "u"));
    assertSecretIsNotEchoed(result);
  });
});

test("real-data guard scans the staged blob even when the worktree copy is safe", () => {
  withSyntheticRepo((root) => {
    write(root, "staged.txt", `Authorization: Bearer ${syntheticSecret}\n`);
    git(root, ["add", "staged.txt"]);
    write(root, "staged.txt", "Authorization is injected from the environment.\n");

    const result = runGuard(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\[index\]/u);
    assertSecretIsNotEchoed(result);
  });
});

test("real-data guard rejects nonignored untracked secrets and forbidden environment filenames", () => {
  withSyntheticRepo((root) => {
    write(root, "notes.txt", `rawAuthorization=${syntheticSecret}\n`);
    write(root, ".env.local", "SAFE_PLACEHOLDER=REDACTED\n");

    const result = runGuard(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\[untracked\]/u);
    assert.match(result.stderr, /environment_file/u);
    assertSecretIsNotEchoed(result);
  });
});

test("real-data guard respects Git ignore boundaries", () => {
  withSyntheticRepo((root) => {
    write(root, ".gitignore", "ignored-private.txt\n");
    write(root, "README.md", "Synthetic public file.\n");
    write(root, "ignored-private.txt", `TAVILY_API_KEY=${syntheticSecret}\n`);
    git(root, ["add", ".gitignore", "README.md"]);
    git(root, ["commit", "--quiet", "-m", "synthetic ignore boundary"]);

    const result = runGuard(root);
    assert.equal(result.status, 0, result.stderr);
  });
});

test("real-data guard applies forbidden path rules case-insensitively", () => {
  withSyntheticRepo((root) => {
    write(root, ".ENV.LOCAL", "SAFE_PLACEHOLDER=REDACTED\n");
    write(root, "DATA/private.txt", "synthetic\n");
    write(root, "review.XLSX", "synthetic\n");
    const result = runGuard(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /environment_file/u);
    assert.match(result.stderr, /private_data_path/u);
    assert.match(result.stderr, /excel_workbook/u);
  });
});

test("real-data guard fails closed for oversized, binary, invalid UTF-8, and raw response artifacts", () => {
  withSyntheticRepo((root) => {
    writeBytes(root, "oversized.txt", Buffer.alloc((2 * 1024 * 1024) + 1, 0x41));
    writeBytes(root, "binary.bin", Buffer.from([0x50, 0x4b, 0x00, 0x01]));
    writeBytes(root, "invalid.txt", Buffer.from([0xc3, 0x28]));
    write(root, "cache/Response.JSON", "{}\n");
    const result = runGuard(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /oversized_file_unscanned/u);
    assert.match(result.stderr, /unreviewed_binary_content/u);
    assert.match(result.stderr, /invalid_utf8_content/u);
    assert.match(result.stderr, /provider_raw_response_file/u);
  });
});
