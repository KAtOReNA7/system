import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createFixtureApp } from "../src/http/fixtureApp.js";

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

async function request(path, options = {}) {
  const app = createFixtureApp(baseConfig);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await new Promise((resolve, reject) => {
      const clientRequest = http.request({
        hostname: "127.0.0.1",
        port,
        path,
        method: options.method ?? "GET",
        headers: { accept: "application/json", ...(options.headers ?? {}) }
      }, (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          try {
            resolve({
              statusCode: response.statusCode,
              requestId: response.headers["x-request-id"] ?? null,
              body: JSON.parse(responseBody)
            });
          } catch (error) {
            reject(error);
          }
        });
      });
      clientRequest.on("error", reject);
      if (options.body !== undefined) {
        clientRequest.write(options.body);
      }
      clientRequest.end();
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("M3 material fixture list API is fixture-only and non-formal", async () => {
  const response = await request("/api/m3/new-product/material-fixtures");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.dataset.mode, "fixture");
  assert.equal(response.body.dataset.nonFormal, true);
  assert.equal(response.body.dataset.formalExecutionAllowed, false);
  assert.equal(response.body.items[0].inputMode, "material_first");
});

test("M3 material fixture detail API exposes parsed preview without raw material", async () => {
  const response = await request("/api/m3/new-product/material-fixtures/SYN-M3-MATERIAL-001");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.item.rawMaterialStored, false);
  assert.equal(response.body.item.privateFileRead, false);
  assert.ok(response.body.item.parsePreview.extractedFields.length > 0);
});

test("M3 parse and evaluate APIs process only synthetic fixture ids", async () => {
  const parseResponse = await request("/api/m3/new-product/material-fixtures/SYN-M3-MATERIAL-001/parse", {
    method: "POST",
    body: JSON.stringify({ fixtureOnly: true })
  });
  const evaluateResponse = await request("/api/m3/new-product/material-fixtures/SYN-M3-MATERIAL-001/evaluate", {
    method: "POST",
    body: JSON.stringify({ fixtureOnly: true })
  });

  assert.equal(parseResponse.statusCode, 200);
  assert.equal(parseResponse.body.parseResult.inputMode, "material_first");
  assert.equal(evaluateResponse.statusCode, 200);
  assert.equal(evaluateResponse.body.evaluation.nonFormal, true);
  assert.equal(evaluateResponse.body.evaluation.forecast.pointEstimateOnly, true);
  assert.ok(evaluateResponse.body.evaluation.forecast.forecastContributions.length > 0);
  assert.ok(evaluateResponse.body.evaluation.forecast.channelForecasts[0].channelContributionBreakdown.length > 0);
  assert.equal(evaluateResponse.body.evaluation.candidateRating.ratingType, "new_product_candidate_rating");
  assert.ok(evaluateResponse.body.evaluation.candidateRating.ratingExplanation);
  assert.ok(Array.isArray(evaluateResponse.body.evaluation.researchQuestions));
  assert.ok(Array.isArray(evaluateResponse.body.evaluation.externalEvidence));
  assert.equal(evaluateResponse.body.evaluation.evidenceSummary.nonFormal, true);
  assert.equal(evaluateResponse.body.evaluation.comparableWorks.fixtureOnly, true);
  assert.equal(evaluateResponse.body.evaluation.authorRanking.nonFormal, true);
  assert.equal(evaluateResponse.body.evaluation.guardrails.databaseWritten, false);
  assert.equal(evaluateResponse.body.evaluation.guardrails.externalSearchCalled, false);
  assert.equal(evaluateResponse.body.evaluation.guardrails.chatGptWebCalled, false);
  assert.equal(evaluateResponse.body.evaluation.guardrails.browserAutomationCalled, false);
});

test("M3 comparable and author-ranking APIs are fixture-only and non-formal", async () => {
  const comparablesResponse = await request("/api/m3/new-product/material-fixtures/SYN-M3-MATERIAL-001/comparables");
  const authorRankingResponse = await request("/api/m3/new-product/material-fixtures/SYN-M3-MATERIAL-001/author-ranking");

  assert.equal(comparablesResponse.statusCode, 200);
  assert.equal(comparablesResponse.body.comparableWorks.nonFormal, true);
  assert.equal(comparablesResponse.body.comparableWorks.fixtureOnly, true);
  assert.equal(comparablesResponse.body.comparableWorks.systemSelected.length <= 3, true);
  assert.equal(authorRankingResponse.statusCode, 200);
  assert.equal(authorRankingResponse.body.authorRanking.nonFormal, true);
  assert.equal(authorRankingResponse.body.authorRanking.fixtureOnly, true);
  assert.equal(authorRankingResponse.body.authorRanking.enabled, true);
});

test("M3 external evidence and research-question APIs are fixture-only and non-formal", async () => {
  const evidenceResponse = await request("/api/m3/new-product/material-fixtures/SYN-M3-MATERIAL-002/external-evidence");
  const researchResponse = await request("/api/m3/new-product/material-fixtures/SYN-M3-MATERIAL-002/research-questions");

  assert.equal(evidenceResponse.statusCode, 200);
  assert.equal(evidenceResponse.body.nonFormal, true);
  assert.equal(evidenceResponse.body.fixtureOnly, true);
  assert.equal(evidenceResponse.body.notForFormalDecision, true);
  assert.equal(evidenceResponse.body.noRealSearchCalled, true);
  assert.equal(evidenceResponse.body.noChatGptWebCalled, true);
  assert.ok(evidenceResponse.body.externalEvidence.some((item) => item.evidenceType === "gptWebAssistedSummary"));
  assert.equal(researchResponse.statusCode, 200);
  assert.equal(researchResponse.body.nonFormal, true);
  assert.equal(researchResponse.body.fixtureOnly, true);
  assert.ok(researchResponse.body.researchQuestions.some((item) => item.missingFieldOrRisk === "missing_adaptation_signals"));
});

test("M3 workflow and backtest-anchor APIs are fixture-only and non-formal", async () => {
  const workflowResponse = await request("/api/m3/new-product/material-fixtures/SYN-M3-MATERIAL-001/workflow");
  const anchorResponse = await request("/api/m3/new-product/material-fixtures/SYN-M3-MATERIAL-001/backtest-anchor", {
    method: "POST",
    body: JSON.stringify({ fixtureOnly: true })
  });

  assert.equal(workflowResponse.statusCode, 200);
  assert.equal(workflowResponse.body.workflow.currentState, "backtest_anchor_candidate");
  assert.equal(workflowResponse.body.workflow.nonFormal, true);
  assert.equal(workflowResponse.body.workflow.fixtureOnly, true);
  assert.equal(workflowResponse.body.workflow.notForFormalDecision, true);
  assert.equal(workflowResponse.body.databaseWritten, false);
  assert.equal(anchorResponse.statusCode, 200);
  assert.equal(anchorResponse.body.backtestAnchor.anchorStatus, "locked_fixture");
  assert.equal(anchorResponse.body.backtestAnchor.realBacktestExecuted, false);
  assert.equal(anchorResponse.body.backtestAnchor.databaseWritten, false);
  assert.equal(anchorResponse.body.workflow.currentState, "backtest_anchor_locked_fixture");
});

test("M3 dry-run review API is fixture-only and summarizes completion before after", async () => {
  const response = await request("/api/m3/new-product/dry-run-review");

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.dryRunReview.fixtureOnly, true);
  assert.equal(response.body.dryRunReview.nonFormal, true);
  assert.equal(response.body.dryRunReview.notForFormalDecision, true);
  assert.equal(response.body.dryRunReview.overview.completionNeededCount, 3);
  assert.equal(response.body.dryRunReview.overview.completionAppliedCount, 3);
  assert.equal(response.body.dryRunReview.overview.forecastGeneratedCount, 3);
  assert.equal(response.body.dryRunReview.overview.ratingGeneratedCount, 3);
  assert.equal(response.body.dryRunReview.beforeAfterComparison.every((item) => item.afterMissingCoreFields.length === 0), true);
  assert.equal(response.body.dryRunReview.guardrails.databaseConnected, false);
});

test("M3 dry-run review formal mode is blocked without reading database", async () => {
  const response = await request("/api/m3/new-product/dry-run-review?mode=formal");

  assert.equal(response.statusCode, 423);
  assert.equal(response.body.error.code, "formal_data_blocked");
});

test("M3 parse API rejects raw material payload", async () => {
  const response = await request("/api/m3/new-product/material-fixtures/SYN-M3-MATERIAL-001/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rawText: "SYNTHETIC RAW MATERIAL BODY" })
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, "bad_request");
});

test("M3 formal mode is blocked without reading database", async () => {
  const response = await request("/api/m3/new-product/material-fixtures?mode=formal");

  assert.equal(response.statusCode, 423);
  assert.equal(response.body.error.code, "formal_data_blocked");
});

test("M3 fixture API output does not expose forbidden private markers", async () => {
  const response = await request("/api/m3/new-product/material-fixtures/SYN-M3-MATERIAL-001/evaluate", {
    method: "POST",
    body: JSON.stringify({ fixtureOnly: true })
  });
  const text = JSON.stringify(response.body);

  assert.equal(text.includes("data/private-output"), false);
  assert.equal(text.includes(".xlsx"), false);
  assert.equal(text.includes(".docx"), false);
  assert.equal(text.includes(".pdf"), false);
  assert.equal(text.includes("postgres://"), false);
  assert.equal(text.includes("postgresql://"), false);
  assert.equal(text.includes("developmentRecommendation"), false);
  assert.equal(text.includes("resourceInvestmentLevel"), false);
  assert.equal(text.includes("recommendedDevelopmentDecision"), false);
  assert.equal(text.includes('"webpageFullText":'), false);
  assert.equal(text.includes("pageHtml"), false);
  assert.equal(Object.hasOwn(response.body.evaluation.forecast, "forecastRange"), false);
  assert.equal(response.body.evaluation.guardrails.forecastRangeEmitted, false);
});
