"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { Database } = require("../src/database");

async function temporaryDatabase(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "autumn-hire-"));
  const database = await Database.open(path.join(directory, "test.db"));
  t.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return database;
}

test("同公司同部门追加，同公司不同部门分行", async (t) => {
  const database = await temporaryDatabase(t);
  database.createEvent({
    company: "字节跳动",
    department: "抖音",
    stage: "一面",
    scheduled_at: "",
  });
  database.createEvent({
    company: " 字 节 跳 动 ",
    department: "抖 音",
    stage: "二面",
    scheduled_at: "2026-08-05T14:00",
  });
  database.createEvent({
    company: "字节跳动",
    department: "飞书",
    stage: "测评",
    scheduled_at: "2026-08-03T09:00",
  });

  const dashboard = database.dashboard();
  assert.equal(dashboard.stats.applications, 2);
  assert.equal(dashboard.stats.events, 3);
  const douyin = dashboard.applications.find(
    (application) => application.department_key === "抖音",
  );
  assert.deepEqual(
    douyin.events.map((event) => event.stage),
    ["一面", "二面"],
  );
});

test("通过、未通过、待确认和通过率正确流转", async (t) => {
  const database = await temporaryDatabase(t);
  const first = database.createEvent({
    company: "OPPO",
    department: "系统平台",
    stage: "测评",
  });
  const second = database.createEvent({
    company: "OPPO",
    department: "系统平台",
    stage: "一面",
  });
  const third = database.createEvent({
    company: "OPPO",
    department: "系统平台",
    stage: "二面",
  });

  database.updateEvent(first.id, { outcome: "rejected" });
  database.updateEvent(second.id, {
    outcome: "passed",
    code_problem: "LRU 缓存",
  });

  const dashboard = database.dashboard();
  assert.equal(dashboard.stats.pending, 1);
  assert.equal(dashboard.stats.pass_rate, 50);
  assert.equal(dashboard.pending[0].id, third.id);
});

test("非法日期和非面试手撕代码会被拒绝", async (t) => {
  const database = await temporaryDatabase(t);
  assert.throws(
    () =>
      database.createEvent({
        company: "测试公司",
        department: "平台",
        stage: "笔试",
        scheduled_at: "不是日期",
      }),
    /日期与时间格式无效/u,
  );
  const event = database.createEvent({
    company: "测试公司",
    department: "平台",
    stage: "笔试",
  });
  assert.throws(
    () =>
      database.updateEvent(event.id, {
        outcome: "passed",
        code_problem: "不应保存",
      }),
    /只有面试阶段/u,
  );
});

test("数据库会落盘并能重新打开", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "autumn-hire-"));
  const databasePath = path.join(directory, "test.db");
  const database = await Database.open(databasePath);
  database.createEvent({
    company: "腾讯",
    department: "WXG",
    stage: "已投递",
  });
  database.close();

  const reopened = await Database.open(databasePath);
  assert.equal(reopened.dashboard().stats.events, 1);
  reopened.close();
  fs.rmSync(directory, { recursive: true, force: true });
});
