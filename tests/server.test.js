"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { Database } = require("../src/database");
const { startLocalServer } = require("../src/server");

test("本地 API 可录入、更新并导出 CSV", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "autumn-server-"));
  const database = await Database.open(path.join(directory, "test.db"));
  const local = await startLocalServer({
    database,
    webRoot: path.join(__dirname, "..", "web"),
    preferredPort: 18765,
  });
  t.after(async () => {
    await new Promise((resolve) => local.server.close(resolve));
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const createResponse = await fetch(`${local.baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company: "美团",
      department: "到店",
      stage: "一面",
      scheduled_at: "2026-08-12T10:30",
    }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();

  const updateResponse = await fetch(
    `${local.baseUrl}/api/events/${created.id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outcome: "passed",
        code_problem: "反转链表",
      }),
    },
  );
  assert.equal(updateResponse.status, 200);

  const dashboardResponse = await fetch(`${local.baseUrl}/api/dashboard`);
  const dashboard = await dashboardResponse.json();
  assert.equal(dashboard.stats.events, 1);
  assert.equal(dashboard.stats.pending, 0);
  assert.equal(dashboard.applications[0].events[0].outcome, "passed");

  const csvResponse = await fetch(`${local.baseUrl}/api/export.csv`);
  const csv = await csvResponse.text();
  assert.equal(csvResponse.status, 200);
  assert.match(csv, /美团/u);
  assert.match(csv, /反转链表/u);
});

test("写接口拒绝非 JSON 和跨来源请求", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "autumn-server-"));
  const database = await Database.open(path.join(directory, "test.db"));
  const local = await startLocalServer({
    database,
    webRoot: path.join(__dirname, "..", "web"),
    preferredPort: 18775,
  });
  t.after(async () => {
    await new Promise((resolve) => local.server.close(resolve));
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const plainResponse = await fetch(`${local.baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "{}",
  });
  assert.equal(plainResponse.status, 415);

  const originResponse = await fetch(`${local.baseUrl}/api/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://example.com",
    },
    body: "{}",
  });
  assert.equal(originResponse.status, 403);
});
