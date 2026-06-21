import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { createApp } from "../../src/http/app.js";

const FORBIDDEN_WRITE_CONTROL_WORDS = [
  "导入",
  "激活",
  "撤销",
  "重试",
  "取消",
  "上传",
  "应用",
  "迁移",
  "写入",
  "提交"
];

const SENSITIVE_OUTPUT_PATTERNS = [
  /postgres(?:ql)?:\/\//i,
  /password/i,
  /passwd/i,
  /jdbc:/i,
  /SELECT\s+/i,
  /INSERT\s+/i,
  /UPDATE\s+/i,
  /DELETE\s+/i,
  /at\s+.+\(.+:\d+:\d+\)/,
  /background_worker database connection is not configured/i,
  /D:\\/i
];

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

let browser;
let server;
let baseUrl;

async function listen(serverToStart) {
  await new Promise((resolve) => serverToStart.listen(0, "127.0.0.1", resolve));
  const address = serverToStart.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function closeServer(serverToClose) {
  await new Promise((resolve, reject) => {
    serverToClose.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function readVisibleText(page) {
  return page.locator("body").innerText();
}

async function assertNoForbiddenWriteControls(page) {
  const controls = await page.locator("button, a, label").evaluateAll((elements) =>
    elements.map((element) => element.textContent?.trim() ?? "").filter(Boolean)
  );
  const forbidden = controls.filter((text) =>
    FORBIDDEN_WRITE_CONTROL_WORDS.some((word) => text.includes(word))
  );
  assert.deepEqual(forbidden, [], `Unexpected write-like controls: ${forbidden.join(", ")}`);
}

function assertNoSensitiveOutput(text) {
  for (const pattern of SENSITIVE_OUTPUT_PATTERNS) {
    assert.doesNotMatch(text, pattern);
  }
}

async function openPage(path, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1280, height: 720 }
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}${path}`, { waitUntil: "load" });
  return { context, page };
}

before(async () => {
  server = http.createServer(createApp(baseConfig));
  await listen(server);
  browser = await chromium.launch();
});

after(async () => {
  if (browser) {
    await browser.close();
  }
  if (server?.listening) {
    await closeServer(server);
  }
});

test("admin default no-database page renders degraded state without leaking sensitive details", async () => {
  const { context, page } = await openPage("/admin");
  try {
    await page.getByText("降级 / degraded").waitFor();
    const text = await readVisibleText(page);

    assert.match(text, /数据库未配置/);
    assert.match(text, /生命周期状态/);
    assert.match(text, /暂不可读取/);
    assert.match(text, /database_not_configured/);
    assert.match(text, /不等同于空库/);
    assertNoSensitiveOutput(text);
    await assertNoForbiddenWriteControls(page);
  } finally {
    await context.close();
  }
});

test("admin fixture mode renders all read-only pages in success state", async () => {
  const cases = [
    {
      path: "/admin?fixture=1#system",
      awaitText: "结构已初始化",
      expected: ["正常 / success", "结构已初始化", "schema_initialized"]
    },
    {
      path: "/admin?fixture=1#works",
      awaitText: "SYN-WORK-001",
      expected: ["正常 / success", "SYN-WORK-001", "未提供表示当前 API 尚未返回标准作品名称"]
    },
    {
      path: "/admin?fixture=1#mapping",
      awaitText: "构建中",
      expected: ["正常 / success", "构建中", "building"]
    },
    {
      path: "/admin?fixture=1#jobs",
      awaitText: "等待中",
      expected: ["正常 / success", "等待中", "pending"]
    }
  ];

  for (const testCase of cases) {
    const { context, page } = await openPage(testCase.path);
    try {
      await page.getByText("正常 / success").waitFor();
      await page.waitForFunction(
        (needle) => document.body.innerText.includes(needle),
        testCase.awaitText
      );
      const text = await readVisibleText(page);
      for (const expected of testCase.expected) {
        assert.match(text, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
      assertNoSensitiveOutput(text);
      await assertNoForbiddenWriteControls(page);
    } finally {
      await context.close();
    }
  }
});

test("admin mobile fixture tables avoid page overflow and expose horizontal scroll hints", async () => {
  const tablePages = ["works", "mapping", "jobs"];

  for (const pageName of tablePages) {
    const { context, page } = await openPage(`/admin?fixture=1#${pageName}`, {
      viewport: { width: 390, height: 780 }
    });
    try {
      await page.getByText("小屏幕下可横向滚动查看完整列").waitFor();
      const metrics = await page.evaluate(() => {
        const activePage = document.querySelector("[data-page]:not(.is-hidden)");
        const tableWrap = activePage?.querySelector(".table-wrap");
        return {
          pageScrollWidth: document.documentElement.scrollWidth,
          pageClientWidth: document.documentElement.clientWidth,
          tableClientWidth: tableWrap?.clientWidth ?? 0,
          tableScrollWidth: tableWrap?.scrollWidth ?? 0,
          tableOverflowX: tableWrap ? getComputedStyle(tableWrap).overflowX : ""
        };
      });

      assert.ok(
        metrics.pageScrollWidth <= metrics.pageClientWidth,
        `${pageName} should not cause page-level horizontal overflow`
      );
      assert.ok(
        metrics.tableScrollWidth > metrics.tableClientWidth,
        `${pageName} table should be horizontally scrollable inside its container`
      );
      assert.equal(metrics.tableOverflowX, "auto");
      await assertNoForbiddenWriteControls(page);
    } finally {
      await context.close();
    }
  }
});
