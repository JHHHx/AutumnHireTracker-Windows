"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

function json(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": body.length,
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(body);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const contentType = request.headers["content-type"] ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      reject(Object.assign(new Error("请求必须使用 JSON 格式"), { status: 415 }));
      request.resume();
      return;
    }

    const chunks = [];
    let length = 0;
    request.on("data", (chunk) => {
      length += chunk.length;
      if (length > 1_000_000) {
        reject(Object.assign(new Error("请求内容过大"), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!value || Array.isArray(value) || typeof value !== "object") {
          throw new Error("请求内容必须是对象");
        }
        resolve(value);
      } catch (error) {
        reject(Object.assign(new Error(error.message || "请求格式无效"), {
          status: 400,
        }));
      }
    });
    request.on("error", reject);
  });
}

function isAllowedRequest(request, port) {
  const host = request.headers.host ?? "";
  const allowedHosts = new Set([
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    `[::1]:${port}`,
  ]);
  if (!allowedHosts.has(host)) return false;

  const origin = request.headers.origin;
  if (!origin) return true;
  return origin === `http://127.0.0.1:${port}` ||
    origin === `http://localhost:${port}`;
}

function serveStatic(response, webRoot, pathname) {
  const aliases = new Map([
    ["/", "index.html"],
    ["/widget", "widget.html"],
  ]);
  let relativePath;
  try {
    relativePath = aliases.get(pathname) ??
      decodeURIComponent(pathname).replace(/^\/+/u, "");
  } catch {
    json(response, 400, { error: "路径无效" });
    return;
  }

  const candidate = path.resolve(webRoot, relativePath);
  const relative = path.relative(webRoot, candidate);
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    !fs.existsSync(candidate) ||
    !fs.statSync(candidate).isFile()
  ) {
    json(response, 404, { error: "页面不存在" });
    return;
  }

  const body = fs.readFileSync(candidate);
  response.writeHead(200, {
    "Cache-Control": [".html", ".js", ".css"].includes(path.extname(candidate))
      ? "no-store"
      : "public, max-age=3600",
    "Content-Length": body.length,
    "Content-Type":
      MIME_TYPES.get(path.extname(candidate)) ?? "application/octet-stream",
  });
  response.end(body);
}

async function requestHandler(request, response, context) {
  const { database, port, webRoot } = context;
  if (!isAllowedRequest(request, port)) {
    json(response, 403, { error: "请求来源无效" });
    return;
  }

  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      json(response, 200, {
        ok: true,
        product: "AutumnHireTrackerWindows",
        database: database.path,
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/dashboard") {
      json(response, 200, database.dashboard());
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/export.csv") {
      const body = Buffer.from(database.exportCsv(), "utf8");
      response.writeHead(200, {
        "Content-Disposition":
          'attachment; filename="autumn-hire-progress.csv"',
        "Content-Length": body.length,
        "Content-Type": "text/csv; charset=utf-8",
      });
      response.end(body);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/events") {
      json(response, 201, database.createEvent(await readJson(request)));
      return;
    }
    const eventMatch =
      request.method === "PATCH"
        ? url.pathname.match(/^\/api\/events\/(\d+)$/u)
        : null;
    if (eventMatch) {
      json(
        response,
        200,
        database.updateEvent(Number(eventMatch[1]), await readJson(request)),
      );
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      json(response, 404, { error: "接口不存在" });
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      json(response, 405, { error: "请求方法不支持" });
      return;
    }
    serveStatic(response, webRoot, url.pathname);
  } catch (error) {
    const status = error.code === "NOT_FOUND" ? 404 : error.status ?? 400;
    json(response, status, { error: error.message || "请求处理失败" });
  }
}

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

async function startLocalServer({
  database,
  webRoot,
  preferredPort = 8765,
  maxAttempts = 10,
}) {
  const host = "127.0.0.1";
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const port = preferredPort + offset;
    const server = http.createServer((request, response) => {
      requestHandler(request, response, { database, port, webRoot });
    });
    try {
      await listen(server, host, port);
      return {
        host,
        port,
        server,
        baseUrl: `http://${host}:${port}`,
      };
    } catch (error) {
      server.close();
      if (error.code !== "EADDRINUSE") throw error;
    }
  }
  throw new Error("8765–8774 端口均被占用，无法启动本地服务");
}

module.exports = {
  isAllowedRequest,
  readJson,
  startLocalServer,
};
