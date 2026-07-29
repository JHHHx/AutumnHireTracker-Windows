const widgetState = {
  applications: [],
  pending: [],
};

const INTERVIEW_STAGES = new Set(["一面", "二面", "三面", "四面", "HR面"]);

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stageClass(stage) {
  if (stage === "测评") return "stage-assessment";
  if (stage === "笔试") return "stage-written";
  if (INTERVIEW_STAGES.has(stage)) return "stage-interview";
  if (stage === "Offer") return "stage-offer";
  return "stage-applied";
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = parseDate(value);
  if (!date) return "时间待定";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function defaultDateTime() {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function showToast(message, isError = false) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("visible");
  }, 2300);
}

function updateSuggestions() {
  const companies = [
    ...new Set(widgetState.applications.map((item) => item.company)),
  ].sort((a, b) => a.localeCompare(b, "zh-CN"));
  document.querySelector("#company-options").innerHTML = companies
    .map((company) => `<option value="${escapeHtml(company)}"></option>`)
    .join("");

  const selectedCompany = document
    .querySelector("#company")
    .value.trim()
    .toLowerCase();
  const departments = [
    ...new Set(
      widgetState.applications
        .filter(
          (item) =>
            !selectedCompany ||
            item.company.toLowerCase() === selectedCompany,
        )
        .map((item) => item.department),
    ),
  ].sort((a, b) => a.localeCompare(b, "zh-CN"));
  document.querySelector("#department-options").innerHTML = departments
    .map((department) => `<option value="${escapeHtml(department)}"></option>`)
    .join("");

  const exactMatch = widgetState.applications.find(
    (item) =>
      item.company.toLowerCase() === selectedCompany &&
      item.department.toLowerCase() ===
        document.querySelector("#department").value.trim().toLowerCase(),
  );
  if (exactMatch) {
    if (!document.querySelector("#role").value) {
      document.querySelector("#role").value = exactMatch.role || "";
    }
    if (!document.querySelector("#website").value) {
      document.querySelector("#website").value = exactMatch.website || "";
    }
  }
}

function pendingCard(event) {
  return `
    <article class="pending-card" data-event-id="${event.id}">
      <div class="pending-card-top">
        <div>
          <h3>${escapeHtml(event.company)}</h3>
          <p>${escapeHtml(event.department)}${event.role ? ` / ${escapeHtml(event.role)}` : ""}</p>
        </div>
        <div class="pending-card-controls">
          <span class="stage-badge ${stageClass(event.stage)}">${escapeHtml(event.stage)}</span>
          <button
            class="pending-delete-button"
            type="button"
            data-delete-event
          >撤销记录</button>
        </div>
      </div>
      <time class="pending-time" datetime="${escapeHtml(event.scheduled_at)}">${escapeHtml(formatDateTime(event.scheduled_at))}</time>
      ${
        event.is_interview
          ? `
            <label class="code-field">
              <span>手撕代码（选填）</span>
              <textarea data-code-problem rows="2" placeholder="例如：LRU 缓存、反转链表"></textarea>
            </label>
          `
          : ""
      }
      <div class="outcome-actions">
        <button class="outcome-button pass" type="button" data-outcome="passed">通过</button>
        <button class="outcome-button reject" type="button" data-outcome="rejected">未通过</button>
      </div>
    </article>
  `;
}

function renderPending() {
  const list = document.querySelector("#pending-list");
  document.querySelector("#pending-count").textContent =
    widgetState.pending.length;

  if (!widgetState.pending.length) {
    list.innerHTML = `
      <div class="empty-state compact">
        <span class="empty-check" aria-hidden="true">✓</span>
        <div>
          <strong>暂时没有待确认事项</strong>
          <p>提交新阶段后会显示在这里</p>
        </div>
      </div>
    `;
    return;
  }
  list.innerHTML = widgetState.pending.map(pendingCard).join("");
}

async function loadData({ quiet = false } = {}) {
  try {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    if (!response.ok) throw new Error("读取数据失败");
    const data = await response.json();
    widgetState.applications = data.applications;
    widgetState.pending = data.pending;
    updateSuggestions();
    renderPending();
  } catch (error) {
    if (!quiet) showToast(error.message || "无法连接本地服务", true);
    document.querySelector("#pending-list").innerHTML = `
      <div class="empty-state compact">
        <div>
          <strong>服务暂时不可用</strong>
          <p>请重新打开秋招小组件。</p>
        </div>
      </div>
    `;
  }
}

async function submitEntry(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector(".submit-button");
  const error = document.querySelector("#form-error");
  error.textContent = "";

  const payload = Object.fromEntries(new FormData(form).entries());
  if (!payload.company.trim() || !payload.department.trim() || !payload.stage) {
    error.textContent = "请填写公司、部门并选择当前阶段。";
    return;
  }

  button.disabled = true;
  button.querySelector("span").textContent = "正在保存";
  try {
    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "保存失败");

    const retainedCompany = payload.company;
    const retainedDepartment = payload.department;
    const retainedWebsite = payload.website;
    const retainedRole = payload.role;
    form.reset();
    document.querySelector("#company").value = retainedCompany;
    document.querySelector("#department").value = retainedDepartment;
    document.querySelector("#website").value = retainedWebsite;
    document.querySelector("#role").value = retainedRole;
    document.querySelector("#scheduled-at").value = defaultDateTime();
    showToast("已追加到这条公司主线");
    await loadData({ quiet: true });
    document.querySelector("#stage").focus();
  } catch (requestError) {
    error.textContent = requestError.message || "保存失败，请重试。";
  } finally {
    button.disabled = false;
    button.querySelector("span").textContent = "提交进度";
  }
}

async function updateOutcome(button) {
  const card = button.closest(".pending-card");
  const eventId = card.dataset.eventId;
  const codeProblem = card.querySelector("[data-code-problem]")?.value.trim() || "";
  const outcome = button.dataset.outcome;
  card.querySelectorAll("button").forEach((item) => {
    item.disabled = true;
  });
  try {
    const response = await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outcome,
        code_problem: codeProblem,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "更新失败");
    showToast(outcome === "passed" ? "已标记为通过" : "已标记为未通过");
    await loadData({ quiet: true });
  } catch (error) {
    showToast(error.message || "更新失败，请重试", true);
    card.querySelectorAll("button").forEach((item) => {
      item.disabled = false;
    });
  }
}

async function deletePendingEvent(button) {
  const card = button.closest(".pending-card");
  const eventId = card.dataset.eventId;
  const event = widgetState.pending.find(
    (item) => Number(item.id) === Number(eventId),
  );
  if (!event) return;
  if (
    !window.confirm(
      `确认撤销这条记录吗？\n\n${event.company} / ${event.department}\n${event.stage} · ${formatDateTime(event.scheduled_at)}\n\n删除后无法恢复。`,
    )
  ) {
    return;
  }

  card.querySelectorAll("button").forEach((item) => {
    item.disabled = true;
  });
  try {
    const response = await fetch(`/api/events/${eventId}`, {
      method: "DELETE",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "删除失败");
    showToast("记录已撤销");
    await loadData({ quiet: true });
  } catch (error) {
    showToast(error.message || "删除失败，请重试", true);
    card.querySelectorAll("button").forEach((item) => {
      item.disabled = false;
    });
  }
}

function initialize() {
  document.querySelector("#widget-date").textContent = new Intl.DateTimeFormat(
    "zh-CN",
    {
      month: "long",
      day: "numeric",
      weekday: "long",
    },
  ).format(new Date());
  document.querySelector("#scheduled-at").value = defaultDateTime();

  document.querySelector("#entry-form").addEventListener("submit", submitEntry);
  document.querySelector("#company").addEventListener("input", updateSuggestions);
  document
    .querySelector("#department")
    .addEventListener("change", updateSuggestions);
  document.querySelector("#pending-list").addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-event]");
    if (deleteButton) {
      deletePendingEvent(deleteButton);
      return;
    }
    const button = event.target.closest("[data-outcome]");
    if (button) updateOutcome(button);
  });
  document.addEventListener("keydown", (event) => {
    if (event.metaKey && event.key === "Enter") {
      document
        .querySelector("#entry-form")
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadData({ quiet: true });
  });
  loadData();
}

initialize();
