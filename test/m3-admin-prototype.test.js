import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createApp } from "../src/http/app.js";
import { listenOnFetchSafePort } from "./helpers/listenOnFetchSafePort.js";

const baseConfig = {
  service: "m1-audiobook-evaluation",
  appEnv: "test",
  port: 0,
  database: {
    rwUrl: undefined,
    readonlyUrl: undefined,
    backgroundUrl: undefined
  }
};

async function requestText(path) {
  const app = createApp(baseConfig);
  const server = http.createServer(app);
  const port = await listenOnFetchSafePort(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    return {
      statusCode: response.status,
      body: await response.text()
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("admin prototype includes M3 material-first fixture page", async () => {
  const response = await requestText("/admin");

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /M3 material fixtures/);
  assert.match(response.body, /M3 material-first fixture prototype/);
});

test("admin JavaScript calls M3 fixture API and shows non-formal guardrails", async () => {
  const response = await requestText("/admin/app.js");

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /\/api\/m3\/new-product\/material-fixtures/);
  assert.match(response.body, /nonFormal=true/);
  assert.match(response.body, /No forecast range/);
  assert.match(response.body, /No development recommendation/);
  assert.match(response.body, /System comparable works/);
  assert.match(response.body, /sameAuthorReferenceWorks/);
  assert.match(response.body, /Author ranking/);
  assert.match(response.body, /Buyout treatment/);
  assert.match(response.body, /Forecast contribution breakdown/);
  assert.match(response.body, /Rating explanation/);
  assert.match(response.body, /Rating support factors/);
  assert.match(response.body, /Author ranking influence/);
  assert.match(response.body, /No resource investment level/);
  assert.match(response.body, /Research questions/);
  assert.match(response.body, /External evidence/);
  assert.match(response.body, /GPT web-assisted boundary/);
  assert.match(response.body, /Workflow overview/);
  assert.match(response.body, /Workflow timeline/);
  assert.match(response.body, /Full evaluation chain/);
  assert.match(response.body, /Backtest anchor/);
  assert.match(response.body, /Backtest future windows/);
  assert.match(response.body, /No real backtest yet/);
  assert.match(response.body, /M3_DRY_RUN_REVIEW_API/);
  assert.match(response.body, /Dry-run review overview/);
  assert.match(response.body, /Before completion chain|After completion chain/);
  assert.match(response.body, /Human acceptance checklist/);
  assert.match(response.body, /No real search/);
  assert.match(response.body, /browser automation/);
  assert.doesNotMatch(response.body, /method:\s*["'`](PUT|PATCH|DELETE)/i);
  assert.doesNotMatch(response.body, /switch_mapping_version/i);
});
