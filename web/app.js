const state = {
  applications: [],
  upcoming: [],
  stats: {},
  search: "",
  stage: "",
};

const INTERVIEWS = new Set(["一面", "二面", "三面", "四面", "HR面"]);

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeWebsite(value = "") {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function stageClass(stage) {
  if (stage === "测评") return "stage-assessment";
  if (stage === "笔试") return "stage-written";
  if (INTERVIEWS.has(stage)) return "stage-interview";
  if (stage === "Offer") return "stage-offer";
  return "stage-applied";
}

function filterStageName(stage) {
  return INTERVIEWS.has(stage) ? "面试" : stage;
}

function outcomeLabel(outcome) {
  if (outcome === "passed") return "已通过";
  if (outcome === "rejected") return "未通过";
  return "待确认";
}

function outcomeClass(outcome) {
  if (outcome === "passed") return "outcome-passed";
  if (outcome === "rejected") return "outcome-rejected";
  return "";
}

function parseLocalDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value, fallback = "时间待定") {
  const date = parseLocalDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatScheduleDate(value) {
  const date = parseLocalDate(value);
  if (!date) return { day: "待定", month: "未安排" };
  return {
    day: String(date.getDate()).padStart(2, "0"),
    month: `${date.getMonth() + 1}月 ${new Intl.DateTimeFormat("zh-CN", {
      weekday: "short",
    }).format(date)}`,
  };
}

function showToast(message, isError = false) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("visible");
  }, 2600);
}

function renderStats() {
  document.querySelector("#hero-pending").textContent = state.stats.pending ?? 0;
  document.querySelector("#metric-applications").textContent =
    state.stats.applications ?? 0;
  document.querySelector("#metric-upcoming").textContent =
    state.stats.upcoming ?? 0;
  document.querySelector("#metric-pass-rate").textContent =
    state.stats.pass_rate ?? 0;
  document.querySelector("#metric-offers").textContent = state.stats.offers ?? 0;
}

function renderSchedule() {
  const list = document.querySelector("#schedule-list");
  document.querySelector("#schedule-count").textContent =
    `${state.upcoming.length} 项`;

  if (!state.upcoming.length) {
    list.innerHTML = `
      <div class="empty-state compact">
        <div>
          <strong>近期没有待办</strong>
          <p>在快速录入中添加下一场测评、笔试或面试。</p>
        </div>
      </div>
    `;
    return;
  }

  list.innerHTML = state.upcoming
    .slice(0, 8)
    .map((event) => {
      const date = formatScheduleDate(event.scheduled_at);
      return `
        <article class="schedule-item">
          <div class="schedule-date">
            <strong>${escapeHtml(date.day)}</strong>
            <span>${escapeHtml(date.month)}</span>
          </div>
          <div class="schedule-copy">
            <strong>${escapeHtml(event.company)}</strong>
            <p>${escapeHtml(event.department)}${event.role ? ` / ${escapeHtml(event.role)}` : ""}</p>
            <span class="schedule-stage ${stageClass(event.stage)}">${escapeHtml(event.stage)}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function stageCard(event) {
  const details = event.code_problem || event.notes;
  return `
    <article
      class="stage-card ${stageClass(event.stage)} ${outcomeClass(event.outcome)}"
      data-event-id="${event.id}"
    >
      <header>
        <strong>${escapeHtml(event.stage)}</strong>
        <details class="stage-actions">
          <summary aria-label="管理这条记录">···</summary>
          <div class="stage-action-menu">
            <button type="button" data-event-action="edit">修改记录</button>
            ${
              event.outcome
                ? '<button type="button" data-event-action="reset">恢复待确认</button>'
                : ""
            }
            <button class="danger" type="button" data-event-action="delete">删除记录</button>
          </div>
        </details>
      </header>
      <span class="outcome-text">${outcomeLabel(event.outcome)}</span>
      <time datetime="${escapeHtml(event.scheduled_at)}">${escapeHtml(formatDateTime(event.scheduled_at))}</time>
      ${
        details
          ? `<p class="${event.code_problem ? "code-note" : ""}">${event.code_problem ? "手撕：" : ""}${escapeHtml(details)}</p>`
          : ""
      }
    </article>
  `;
}

function findEvent(eventId) {
  for (const application of state.applications) {
    const event = application.events.find(
      (item) => Number(item.id) === Number(eventId),
    );
    if (event) return { application, event };
  }
  return null;
}

async function updateEvent(eventId, payload) {
  const response = await fetch(`/api/events/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "更新失败");
  return result;
}

function updateEditorCodeVisibility() {
  const stage = document.querySelector("#editor-stage").value;
  const codeField = document.querySelector("#editor-code-field");
  const isInterview = INTERVIEWS.has(stage);
  codeField.hidden = !isInterview;
  if (!isInterview) {
    document.querySelector("#editor-code-problem").value = "";
  }
}

function openEventEditor(eventId) {
  const match = findEvent(eventId);
  if (!match) {
    showToast("没有找到这条记录", true);
    return;
  }
  const { event } = match;
  document.querySelector("#editor-event-id").value = event.id;
  document.querySelector("#editor-stage").value = event.stage;
  document.querySelector("#editor-scheduled-at").value =
    event.scheduled_at || "";
  document.querySelector("#editor-notes").value = event.notes || "";
  document.querySelector("#editor-code-problem").value =
    event.code_problem || "";
  document.querySelector("#editor-error").textContent = "";
  updateEditorCodeVisibility();
  document.querySelector("#event-editor").showModal();
}

function closeEventEditor() {
  document.querySelector("#event-editor").close();
}

async function saveEventEditor(event) {
  event.preventDefault();
  const error = document.querySelector("#editor-error");
  const submit = event.currentTarget.querySelector('[type="submit"]');
  error.textContent = "";
  submit.disabled = true;
  try {
    await updateEvent(document.querySelector("#editor-event-id").value, {
      stage: document.querySelector("#editor-stage").value,
      scheduled_at: document.querySelector("#editor-scheduled-at").value,
      notes: document.querySelector("#editor-notes").value,
      code_problem: document.querySelector("#editor-code-problem").value,
    });
    closeEventEditor();
    showToast("记录已更新");
    await loadDashboard({ quiet: true });
  } catch (requestError) {
    error.textContent = requestError.message || "保存失败，请重试";
  } finally {
    submit.disabled = false;
  }
}

async function resetEventOutcome(eventId) {
  const match = findEvent(eventId);
  if (!match) return;
  const { application, event } = match;
  if (
    !window.confirm(
      `将“${application.company} / ${application.department} / ${event.stage}”恢复为待确认吗？`,
    )
  ) {
    return;
  }
  try {
    await updateEvent(eventId, { outcome: null });
    showToast("已恢复为待确认");
    await loadDashboard({ quiet: true });
  } catch (error) {
    showToast(error.message || "恢复失败，请重试", true);
  }
}

async function deleteEvent(eventId) {
  const match = findEvent(eventId);
  if (!match) return;
  const { application, event } = match;
  const time = formatDateTime(event.scheduled_at);
  if (
    !window.confirm(
      `确认删除这条记录吗？\n\n${application.company} / ${application.department}\n${event.stage} · ${time}\n\n删除后无法恢复。`,
    )
  ) {
    return;
  }
  try {
    const response = await fetch(`/api/events/${eventId}`, {
      method: "DELETE",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "删除失败");
    showToast(
      result.application_deleted
        ? "记录和空的公司主线已删除"
        : "记录已删除",
    );
    await loadDashboard({ quiet: true });
  } catch (error) {
    showToast(error.message || "删除失败，请重试", true);
  }
}

function applicationMatches(application) {
  const searchText =
    `${application.company} ${application.department} ${application.role}`.toLowerCase();
  const hasText = !state.search || searchText.includes(state.search);
  const hasStage =
    !state.stage ||
    application.events.some(
      (event) => filterStageName(event.stage) === state.stage,
    );
  return hasText && hasStage;
}

function renderPipelines() {
  const list = document.querySelector("#pipeline-list");
  const visible = state.applications.filter(applicationMatches);

  if (!visible.length) {
    const isFiltering = Boolean(state.search || state.stage);
    list.innerHTML = `
      <div class="empty-state">
        <div>
          <strong>${isFiltering ? "没有符合条件的主线" : "还没有投递记录"}</strong>
          <p>${isFiltering ? "换一个公司名称或阶段试试。" : "从桌面小窗提交第一条记录，同公司、同部门的后续阶段会自动接在后面。"}</p>
          ${isFiltering ? "" : '<a href="/widget">添加第一条进度</a>'}
        </div>
      </div>
    `;
    return;
  }

  list.innerHTML = visible
    .map((application) => {
      const website = safeWebsite(application.website);
      return `
        <article class="pipeline-row">
          <div class="company-cell">
            <h3>${escapeHtml(application.company)}</h3>
            <p>${escapeHtml(application.department)}${application.role ? ` / ${escapeHtml(application.role)}` : ""}</p>
            ${
              website
                ? `<a href="${escapeHtml(website)}" target="_blank" rel="noreferrer">打开投递网站</a>`
                : ""
            }
          </div>
          <div class="stage-track" aria-label="${escapeHtml(application.company)} ${escapeHtml(application.department)}的阶段记录">
            ${application.events.map(stageCard).join("")}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderAll() {
  renderStats();
  renderSchedule();
  renderPipelines();
}

async function loadDashboard({ quiet = false } = {}) {
  try {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    if (!response.ok) throw new Error("读取数据失败");
    const data = await response.json();
    state.applications = data.applications;
    state.upcoming = data.upcoming;
    state.stats = data.stats;
    renderAll();
  } catch (error) {
    if (!quiet) showToast(error.message || "暂时无法连接本地服务", true);
    document.querySelector("#pipeline-list").innerHTML = `
      <div class="empty-state">
        <div>
          <strong>本地服务暂时不可用</strong>
          <p>请确认秋招进度台仍在运行，然后刷新页面。</p>
        </div>
      </div>
    `;
  }
}

function initialize() {
  const today = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
  document.querySelector("#today-label").textContent = today;

  document.querySelector("#search-input").addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderPipelines();
  });

  document.querySelector("#stage-filter").addEventListener("change", (event) => {
    state.stage = event.target.value;
    renderPipelines();
  });

  document.querySelector("#pipeline-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-event-action]");
    if (!button) return;
    const card = button.closest("[data-event-id]");
    const eventId = card?.dataset.eventId;
    if (!eventId) return;
    button.closest("details")?.removeAttribute("open");
    if (button.dataset.eventAction === "edit") {
      openEventEditor(eventId);
    } else if (button.dataset.eventAction === "reset") {
      resetEventOutcome(eventId);
    } else if (button.dataset.eventAction === "delete") {
      deleteEvent(eventId);
    }
  });
  document
    .querySelector("#event-editor-form")
    .addEventListener("submit", saveEventEditor);
  document.querySelector("#editor-stage").addEventListener(
    "change",
    updateEditorCodeVisibility,
  );
  document.querySelectorAll("[data-close-editor]").forEach((button) => {
    button.addEventListener("click", closeEventEditor);
  });
  document.querySelector("#event-editor").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeEventEditor();
  });

  window.addEventListener("focus", () => loadDashboard({ quiet: true }));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadDashboard({ quiet: true });
  });

  loadDashboard();
  window.setInterval(() => loadDashboard({ quiet: true }), 30000);
}

initialize();
