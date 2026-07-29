"use strict";

const fs = require("node:fs");
const path = require("node:path");
const initSqlJs = require("sql.js");

const STAGES = [
  "已投递",
  "测评",
  "笔试",
  "一面",
  "二面",
  "三面",
  "四面",
  "HR面",
  "Offer",
];
const OUTCOMES = new Set(["passed", "rejected"]);
const INTERVIEW_STAGES = new Set(["一面", "二面", "三面", "四面", "HR面"]);
const DATE_TIME_PATTERN =
  /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])T([01]\d|2[0-3]):[0-5]\d$/;

function nowIso() {
  return new Date().toISOString();
}

function compactKey(value) {
  return String(value).replace(/\s+/gu, "").toLocaleLowerCase("zh-CN");
}

function validateScheduledAt(value) {
  if (!value) return;
  if (!DATE_TIME_PATTERN.test(value)) {
    throw new Error("日期与时间格式无效");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("日期与时间格式无效");
  }
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const local = new Date(year, month - 1, day, hour, minute);
  if (
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day ||
    local.getHours() !== hour ||
    local.getMinutes() !== minute
  ) {
    throw new Error("日期与时间格式无效");
  }
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

class Database {
  static async open(databasePath) {
    const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    return new Database(SQL, databasePath);
  }

  constructor(SQL, databasePath) {
    this.path = databasePath;
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    const existing = fs.existsSync(databasePath)
      ? fs.readFileSync(databasePath)
      : null;
    this.db = existing?.length
      ? new SQL.Database(existing)
      : new SQL.Database();
    this.initialize();
  }

  initialize() {
    this.db.run(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company TEXT NOT NULL,
        company_key TEXT NOT NULL,
        department TEXT NOT NULL,
        department_key TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT '',
        website TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(company_key, department_key)
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER NOT NULL
          REFERENCES applications(id) ON DELETE CASCADE,
        stage TEXT NOT NULL,
        scheduled_at TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        outcome TEXT
          CHECK(outcome IN ('passed', 'rejected') OR outcome IS NULL),
        code_problem TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_application
        ON events(application_id, id);
      CREATE INDEX IF NOT EXISTS idx_events_pending
        ON events(outcome, scheduled_at);
    `);
    this.persist();
  }

  rows(sql, parameters = []) {
    const statement = this.db.prepare(sql);
    const result = [];
    try {
      statement.bind(parameters);
      while (statement.step()) {
        result.push(statement.getAsObject());
      }
    } finally {
      statement.free();
    }
    return result;
  }

  row(sql, parameters = []) {
    return this.rows(sql, parameters)[0] ?? null;
  }

  persist() {
    const bytes = this.db.export();
    const temporaryPath = `${this.path}.tmp`;
    fs.writeFileSync(temporaryPath, Buffer.from(bytes));
    fs.renameSync(temporaryPath, this.path);
  }

  transaction(action) {
    this.db.run("BEGIN IMMEDIATE");
    try {
      const result = action();
      this.db.run("COMMIT");
      this.persist();
      return result;
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
  }

  createEvent(payload) {
    const company = String(payload.company ?? "").trim();
    const department = String(payload.department ?? "").trim();
    const stage = String(payload.stage ?? "").trim();
    const website = String(payload.website ?? "").trim();
    const role = String(payload.role ?? "").trim();
    const scheduledAt = String(payload.scheduled_at ?? "").trim();
    const notes = String(payload.notes ?? "").trim();

    if (!company) throw new Error("请填写公司名称");
    if (!department) throw new Error("请填写部门名称");
    if (!STAGES.includes(stage)) throw new Error("请选择有效的投递阶段");
    if (company.length > 120 || department.length > 160) {
      throw new Error("公司或部门名称过长");
    }
    if (role.length > 200) throw new Error("岗位名称过长");
    if (website.length > 2000) throw new Error("投递网站地址过长");
    if (notes.length > 2000) {
      throw new Error("备注请控制在 2000 字以内");
    }
    validateScheduledAt(scheduledAt);

    const timestamp = nowIso();
    return this.transaction(() => {
      const companyKey = compactKey(company);
      const departmentKey = compactKey(department);
      const existing = this.row(
        `SELECT id FROM applications
         WHERE company_key = ? AND department_key = ?`,
        [companyKey, departmentKey],
      );

      let applicationId;
      if (existing) {
        applicationId = Number(existing.id);
        this.db.run(
          `UPDATE applications
           SET company = ?,
               department = ?,
               role = CASE WHEN ? <> '' THEN ? ELSE role END,
               website = CASE WHEN ? <> '' THEN ? ELSE website END,
               updated_at = ?
           WHERE id = ?`,
          [
            company,
            department,
            role,
            role,
            website,
            website,
            timestamp,
            applicationId,
          ],
        );
      } else {
        this.db.run(
          `INSERT INTO applications (
             company, company_key, department, department_key,
             role, website, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            company,
            companyKey,
            department,
            departmentKey,
            role,
            website,
            timestamp,
            timestamp,
          ],
        );
        applicationId = Number(
          this.row("SELECT last_insert_rowid() AS id").id,
        );
      }

      this.db.run(
        `INSERT INTO events (
           application_id, stage, scheduled_at, notes,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [applicationId, stage, scheduledAt, notes, timestamp, timestamp],
      );
      const id = Number(this.row("SELECT last_insert_rowid() AS id").id);
      return { id, application_id: applicationId };
    });
  }

  updateEvent(eventId, payload) {
    const event = this.row(
      "SELECT * FROM events WHERE id = ?",
      [eventId],
    );
    if (!event) {
      const error = new Error("没有找到这条进度");
      error.code = "NOT_FOUND";
      throw error;
    }

    const outcome = Object.hasOwn(payload, "outcome")
      ? payload.outcome
      : event.outcome;
    const stage = String(payload.stage ?? event.stage).trim();
    const scheduledAt = String(
      payload.scheduled_at ?? event.scheduled_at,
    ).trim();
    const notes = String(payload.notes ?? event.notes).trim();
    const codeProblem = String(
      payload.code_problem ?? event.code_problem,
    ).trim();

    if (outcome !== null && !OUTCOMES.has(outcome)) {
      throw new Error("结果必须是通过、未通过或待确认");
    }
    if (!STAGES.includes(stage)) {
      throw new Error("请选择有效的投递阶段");
    }
    validateScheduledAt(scheduledAt);
    if (notes.length > 2000) {
      throw new Error("备注请控制在 2000 字以内");
    }
    if (codeProblem.length > 4000) {
      throw new Error("手撕代码记录请控制在 4000 字以内");
    }
    if (codeProblem && !INTERVIEW_STAGES.has(stage)) {
      throw new Error("只有面试阶段可以记录手撕代码");
    }

    return this.transaction(() => {
      this.db.run(
        `UPDATE events
         SET stage = ?,
             scheduled_at = ?,
             notes = ?,
             outcome = ?,
             code_problem = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          stage,
          scheduledAt,
          notes,
          outcome,
          codeProblem,
          nowIso(),
          eventId,
        ],
      );
      return { id: eventId, outcome, stage };
    });
  }

  deleteEvent(eventId) {
    const event = this.row(
      "SELECT id, application_id FROM events WHERE id = ?",
      [eventId],
    );
    if (!event) {
      const error = new Error("没有找到这条进度");
      error.code = "NOT_FOUND";
      throw error;
    }

    const applicationId = Number(event.application_id);
    return this.transaction(() => {
      this.db.run("DELETE FROM events WHERE id = ?", [eventId]);
      const remaining = Number(
        this.row(
          "SELECT COUNT(*) AS count FROM events WHERE application_id = ?",
          [applicationId],
        ).count,
      );
      const applicationDeleted = remaining === 0;
      if (applicationDeleted) {
        this.db.run("DELETE FROM applications WHERE id = ?", [applicationId]);
      }
      return {
        id: eventId,
        application_id: applicationId,
        application_deleted: applicationDeleted,
      };
    });
  }

  dashboard() {
    const applicationRows = this.rows(
      `SELECT * FROM applications
       ORDER BY company COLLATE NOCASE, department COLLATE NOCASE`,
    );
    const eventRows = this.rows(
      `SELECT e.*, a.company, a.department, a.role, a.website
       FROM events e
       JOIN applications a ON a.id = e.application_id
       ORDER BY e.application_id, e.id`,
    ).map((event) => ({
      ...event,
      is_interview: INTERVIEW_STAGES.has(event.stage),
    }));

    const eventsByApplication = new Map();
    for (const event of eventRows) {
      const id = Number(event.application_id);
      if (!eventsByApplication.has(id)) eventsByApplication.set(id, []);
      eventsByApplication.get(id).push(event);
    }

    const applications = applicationRows.map((application) => {
      const events = eventsByApplication.get(Number(application.id)) ?? [];
      return {
        ...application,
        events,
        latest: events.at(-1) ?? null,
      };
    });

    const pending = eventRows.filter((event) => event.outcome === null);
    const today = new Date();
    const todayText = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");
    const upcoming = pending
      .filter(
        (event) =>
          event.scheduled_at && event.scheduled_at.slice(0, 10) >= todayText,
      )
      .sort(
        (left, right) =>
          left.scheduled_at.localeCompare(right.scheduled_at) ||
          Number(left.id) - Number(right.id),
      );
    const finished = eventRows.filter((event) => event.outcome !== null);
    const passed = finished.filter((event) => event.outcome === "passed");

    return {
      applications,
      pending,
      upcoming,
      stats: {
        applications: applications.length,
        events: eventRows.length,
        pending: pending.length,
        upcoming: upcoming.length,
        offers: eventRows.filter((event) => event.stage === "Offer").length,
        pass_rate: finished.length
          ? Math.round((passed.length / finished.length) * 100)
          : 0,
      },
      stages: [...STAGES],
      generated_at: nowIso(),
    };
  }

  exportCsv() {
    const resultNames = {
      null: "待处理",
      passed: "通过",
      rejected: "未通过",
    };
    const lines = [
      [
        "公司",
        "部门",
        "岗位",
        "投递网站",
        "阶段",
        "时间",
        "结果",
        "手撕代码",
        "备注",
      ],
    ];
    for (const application of this.dashboard().applications) {
      for (const event of application.events) {
        lines.push([
          application.company,
          application.department,
          application.role,
          application.website,
          event.stage,
          event.scheduled_at,
          resultNames[String(event.outcome)],
          event.code_problem,
          event.notes,
        ]);
      }
    }
    return `\ufeff${lines
      .map((line) => line.map(csvCell).join(","))
      .join("\r\n")}\r\n`;
  }

  close() {
    this.persist();
    this.db.close();
  }
}

module.exports = {
  Database,
  INTERVIEW_STAGES,
  STAGES,
  compactKey,
  validateScheduledAt,
};
