import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync
} from "node:fs";
import path from "node:path";
import test from "node:test";

const ARCHIVE_REDIRECTS = [
  "03-账单导入与数据治理.md",
  "07-算法校准与Codex修复.md",
  "08-任务通知导出与监控.md",
  "09-年度目标.md",
  "10-技术与发布约束.md",
  "11-待定项与数据验证计划.md",
  "12-里程碑与验收总表.md",
  "13-PRD结构与M1开发前审阅报告.md"
];

function listFiles(root) {
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(target) : [target];
  });
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

test("promoted Flyway migrations have one canonical tracked copy", () => {
  const formalMigrations = listFiles("db/migrations")
    .filter((file) => file.endsWith(".sql"));
  const candidateMigrations = listFiles(
    "experiments/m1-flyway-candidate/migrations"
  );

  assert.equal(formalMigrations.length, 84);
  assert.deepEqual(candidateMigrations, []);
  assert.equal(
    existsSync(
      "experiments/m1-flyway-candidate/config/flyway-candidate-template.conf"
    ),
    false
  );
  assert.equal(
    existsSync(
      "experiments/m1-flyway-candidate/tests/run_flyway_candidate_validation.py"
    ),
    false
  );
});

test("documentation tree has no byte-identical tracked copies", () => {
  const files = listFiles("docs");
  const byHash = new Map();
  for (const file of files) {
    const digest = sha256(file);
    const paths = byHash.get(digest) ?? [];
    paths.push(file.replaceAll("\\", "/"));
    byHash.set(digest, paths);
  }
  const duplicates = [...byHash.values()].filter((paths) => paths.length > 1);

  assert.deepEqual(duplicates, []);
});

test("deduplicated archive paths point to canonical PRD successors", () => {
  for (const name of ARCHIVE_REDIRECTS) {
    const source = readFileSync(`docs/archive/v0.1/${name}`, "utf8");
    assert.match(source, new RegExp(`\\.\\./\\.\\./prd/${name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`));
    assert.match(source, /91dee993058d80ab36085ec0d3176b7ad154527e/u);
    assert.match(source, /not a new authorization/u);
  }
});

test("package scripts have no byte-identical command aliases", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const commandOwners = new Map();
  for (const [name, command] of Object.entries(packageJson.scripts)) {
    const owners = commandOwners.get(command) ?? [];
    owners.push(name);
    commandOwners.set(command, owners);
  }
  const duplicates = [...commandOwners.values()]
    .filter((owners) => owners.length > 1);

  assert.deepEqual(duplicates, []);
  assert.equal(packageJson.scripts["validate:m2:candidate-b:prd-algorithm"] !== undefined, true);
  assert.equal(packageJson.scripts["review:m2:candidate-b:group-summary"] !== undefined, true);
  assert.equal(packageJson.scripts["review:m2:candidate-b:group-apply"] !== undefined, true);
});
