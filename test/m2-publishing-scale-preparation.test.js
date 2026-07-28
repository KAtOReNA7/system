import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createM2PublishingScalePreparationDirectory,
} from "../scripts/m2-current/prepare_m2_publishing_scale_channel.mjs";

test("empty publishing-scale derived root creates a versioned run directory", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "m2-psc-prepare-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = await createM2PublishingScalePreparationDirectory({
    root,
    preparationDirectory:
      "data/private-output/m2-current-publishing-scale-channel/prepared/v0.1/runs",
    runId: "portable-run-01",
  });
  assert.equal((await stat(directory)).isDirectory(), true);
  assert.equal(
    path.relative(root, directory).replaceAll("\\", "/"),
    "data/private-output/m2-current-publishing-scale-channel/"
      + "prepared/v0.1/runs/portable-run-01",
  );
});

test("publishing-scale preparation directory is non-overwriting and root confined", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "m2-psc-prepare-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const options = {
    root,
    preparationDirectory:
      "data/private-output/m2-current-publishing-scale-channel/prepared/v0.1/runs",
    runId: "portable-run-02",
  };
  await createM2PublishingScalePreparationDirectory(options);
  await assert.rejects(
    createM2PublishingScalePreparationDirectory(options),
    /EEXIST/u,
  );
  await assert.rejects(
    createM2PublishingScalePreparationDirectory({
      root,
      preparationDirectory: "../../outside",
      runId: "portable-run-03",
    }),
    /escapes_root/u,
  );
});
