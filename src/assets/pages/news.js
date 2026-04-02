import { t } from '@/lib/text/i18n.js';

function formatNewsDate(rawDate) {
  if (!rawDate) return "—";

  const parts = String(rawDate).split("T");
  const datePart = parts[0];
  const d = datePart.split("-");

  if (d.length !== 3) return "—";

  const base = `${d[2]}.${d[1]}.${d[0]}`;

  if (parts.length < 2) {
    return base;
  }

  const timePart = parts[1]
    .split("+")[0]
    .split("Z")[0];

  return `${base} ${timePart}`;
}

export async function initNewsPage() {
  const pageSize = 7;
  const allowed = {
    source: ["WebWolium", "Wolium"],
    priority: ["Critical", "Important", "News", "Misc"],
    kind: ["ChangeLog", "Other"],
    time: ["all", "7d", "30d", "90d", "365d"]
  };

  const listEl = document.getElementById("newsList");
  const summaryEl = document.getElementById("newsSummary");
  const pageLabelEl = document.getElementById("newsPageLabel");
  const pageInputEl = document.getElementById("newsPageInput");
  const prevBtn = document.getElementById("newsPrevPage");
  const nextBtn = document.getElementById("newsNextPage");
  const resetBtn = document.getElementById("newsResetFilters");
  const timeSelect = document.getElementById("newsTimeFilter");

  if (!listEl || !summaryEl || !pageLabelEl || !pageInputEl || !prevBtn || !nextBtn || !resetBtn || !timeSelect) {
    return;
  }

  const chipRows = Array.from(document.querySelectorAll("[data-filter-group]"));
  const chipButtons = Array.from(document.querySelectorAll(".news-chip[data-value]"));
  const datasetEl = document.getElementById("newsDataset");

  const allItems = JSON.parse(datasetEl?.textContent || "[]")
    .map((item) => ({
      title: item.title || t("news.card.untitled"),
      url: item.url || "#",
      date: item.date || "",
      rawDate: item.rawDate || "",
      dateDisplay: formatNewsDate(item.rawDate || item.date || ""),
      source: Array.isArray(item.source) ? item.source : [],
      priority: item.priority || "News",
      kind: item.kind || "Other",
      excerpt: item.excerpt || ""
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  function toneKey(value) {
    if (value === "WebWolium") return "WebWolium";
    if (value === "Wolium") return "Wolium";
    if (value === "Critical") return "news.priority.critical";
    if (value === "Important") return "news.priority.important";
    if (value === "News") return "news.priority.news";
    if (value === "Misc") return "news.priority.misc";
    if (value === "ChangeLog") return "news.kind.changelog";
    if (value === "Other") return "news.kind.other";
    return "";
  }

  function toneLabel(value) {
    const key = toneKey(value);
    return key ? t(key) : value;
  }

  function timeLabel(value) {
    if (value === "7d") return t("chart.preset.7d");
    if (value === "30d") return t("chart.preset.30d");
    if (value === "90d") return t("chart.preset.90d");
    if (value === "365d") return t("chart.preset.365d");
    return t("news.filters.time.all");
  }

  function getStateFromUrl() {
    const params = new URLSearchParams(window.location.search);

    const readMulti = (key, whitelist) => {
      const raw = (params.get(key) || "").trim();
      if (!raw) return [];
      return raw
        .split(",")
        .map((item) => item.trim())
        .filter((item, index, arr) => item && arr.indexOf(item) === index && whitelist.includes(item));
    };

    return {
      source: readMulti("source", allowed.source),
      priority: readMulti("priority", allowed.priority),
      kind: readMulti("kind", allowed.kind),
      time: allowed.time.includes(params.get("time")) ? params.get("time") : "all",
      page: Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1)
    };
  }

  function writeStateToUrl(state) {
    const params = new URLSearchParams();

    if (state.source.length) params.set("source", state.source.join(","));
    if (state.priority.length) params.set("priority", state.priority.join(","));
    if (state.kind.length) params.set("kind", state.kind.join(","));
    if (state.time !== "all") params.set("time", state.time);
    if (state.page > 1) params.set("page", String(state.page));

    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }

  function syncControls(state) {
    chipButtons.forEach((button) => {
      const group = button.closest("[data-filter-group]")?.dataset.filterGroup;
      if (!group) return;

      const active = state[group].includes(button.dataset.value);
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    timeSelect.value = state.time;
    pageInputEl.value = String(state.page);
  }

  function isInsideTimeRange(itemDate, timeValue) {
    if (timeValue === "all" || !itemDate) return true;

    const dateOnly = String(itemDate).split("T")[0];
    const item = new Date(`${dateOnly}T00:00:00`);
    if (Number.isNaN(item.getTime())) return false;

    const now = new Date();
    now.setHours(23, 59, 59, 999);

    const from = new Date(now);
    if (timeValue === "7d") from.setDate(from.getDate() - 7);
    if (timeValue === "30d") from.setDate(from.getDate() - 30);
    if (timeValue === "90d") from.setDate(from.getDate() - 90);
    if (timeValue === "365d") from.setDate(from.getDate() - 365);
    from.setHours(0, 0, 0, 0);

    return item >= from && item <= now;
  }

  function passesMultiFilter(values, selected) {
    if (!selected.length) return true;
    return selected.some((item) => values.includes(item));
  }

  function filterItems(state) {
    return allItems.filter((item) => {
      if (!passesMultiFilter(item.source, state.source)) return false;
      if (!passesMultiFilter([item.priority], state.priority)) return false;
      if (!passesMultiFilter([item.kind], state.kind)) return false;
      if (!isInsideTimeRange(item.date, state.time)) return false;
      return true;
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function badgeHtml(label) {
    return `
    <span class="news-badge" data-tone="${escapeHtml(label)}">
      ${escapeHtml(toneLabel(label))}
    </span>
  `;
  }

  function renderList(items, state) {
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    const page = Math.min(state.page, totalPages);
    state.page = page;
    pageInputEl.value = String(page);

    const start = (page - 1) * pageSize;
    const pageItems = items.slice(start, start + pageSize);

    if (!pageItems.length) {
      listEl.innerHTML = `
      <article class="card news-empty">
        <div class="news-empty__title">${escapeHtml(t("news.empty.title"))}</div>
        <div class="news-empty__text">${escapeHtml(t("news.empty.text"))}</div>
      </article>
    `;
    } else {
      listEl.innerHTML = pageItems.map((item) => `
      <article class="card news-card card-hover">
        <div class="news-card__top">
          <time class="news-card__date" datetime="${escapeHtml(item.rawDate || item.date)}">${escapeHtml(item.dateDisplay)}</time>

          <div class="news-badges" aria-label="${escapeHtml(t("news.meta"))}">
            ${item.source.map(badgeHtml).join("")}
            ${badgeHtml(item.priority)}
            ${badgeHtml(item.kind)}
          </div>
        </div>

        <h2 class="news-card__title">
          <a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a>
        </h2>

        ${item.excerpt ? `<p class="news-card__excerpt">${escapeHtml(item.excerpt)}</p>` : ""}

        <div class="news-card__actions">
          <a class="news-link" href="${escapeHtml(item.url)}">${escapeHtml(t("news.card.open"))}</a>
        </div>
      </article>
    `).join("");
    }

    pageLabelEl.textContent = t("news.pagination.page_line", {
      current: page,
      total: totalPages
    });
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= totalPages;

    const activeFilters = [];

    if (state.source.length) {
      activeFilters.push(t("news.summary.source_line", {
        value: state.source.map(toneLabel).join(", ")
      }));
    }

    if (state.priority.length) {
      activeFilters.push(t("news.summary.priority_line", {
        value: state.priority.map(toneLabel).join(", ")
      }));
    }

    if (state.kind.length) {
      activeFilters.push(t("news.summary.type_line", {
        value: state.kind.map(toneLabel).join(", ")
      }));
    }

    if (state.time !== "all") {
      activeFilters.push(t("news.summary.time_line", {
        value: timeLabel(state.time)
      }));
    }

    summaryEl.textContent = activeFilters.length
      ? t("news.summary.filtered", {
          count: items.length,
          filters: activeFilters.join(" • ")
        })
      : t("news.summary.latest", {
          count: items.length
        });

    writeStateToUrl(state);
    syncControls(state);
  }

  function toggleValue(group, value, state) {
    const current = new Set(state[group]);
    if (current.has(value)) current.delete(value);
    else current.add(value);
    state[group] = Array.from(current);
    state.page = 1;
  }

  const state = getStateFromUrl();
  renderList(filterItems(state), state);

  chipRows.forEach((row) => {
    row.addEventListener("click", (event) => {
      const button = event.target.closest(".news-chip[data-value]");
      if (!button) return;

      const group = row.dataset.filterGroup;
      if (!group || !Object.prototype.hasOwnProperty.call(state, group)) return;

      toggleValue(group, button.dataset.value, state);
      renderList(filterItems(state), state);
    });
  });

  timeSelect.addEventListener("change", () => {
    state.time = allowed.time.includes(timeSelect.value) ? timeSelect.value : "all";
    state.page = 1;
    renderList(filterItems(state), state);
  });

  prevBtn.addEventListener("click", () => {
    if (state.page <= 1) return;
    state.page -= 1;
    renderList(filterItems(state), state);
    listEl.scrollIntoView({ block: "start", behavior: "smooth" });
  });

  nextBtn.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(filterItems(state).length / pageSize));
    if (state.page >= totalPages) return;
    state.page += 1;
    renderList(filterItems(state), state);
    listEl.scrollIntoView({ block: "start", behavior: "smooth" });
  });

  pageInputEl.addEventListener("change", () => {
    const totalPages = Math.max(1, Math.ceil(filterItems(state).length / pageSize));
    const nextPage = Math.min(totalPages, Math.max(1, Number.parseInt(pageInputEl.value || "1", 10) || 1));
    state.page = nextPage;
    renderList(filterItems(state), state);
    listEl.scrollIntoView({ block: "start", behavior: "smooth" });
  });

  resetBtn.addEventListener("click", () => {
    state.source = [];
    state.priority = [];
    state.kind = [];
    state.time = "all";
    state.page = 1;
    renderList(filterItems(state), state);
  });

  window.addEventListener("popstate", () => {
    const nextState = getStateFromUrl();
    state.source = nextState.source;
    state.priority = nextState.priority;
    state.kind = nextState.kind;
    state.time = nextState.time;
    state.page = nextState.page;
    renderList(filterItems(state), state);
  });
}