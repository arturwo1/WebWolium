import { t } from "@/lib/index.js";
import { buildServerCard } from "@/lib/servers/serverCard.js";

function setText(node, value) {
  if (node) node.textContent = String(value);
}

function setHidden(node, hidden) {
  if (node) node.hidden = hidden;
}

function field(root, name) {
  return root.querySelector(`[data-field="${name}"]`);
}

function fields(root, name) {
  return Array.from(root.querySelectorAll(`[data-field="${name}"]`));
}

function sortGuilds(a, b) {
  if (a.power.rank !== b.power.rank) return a.power.rank - b.power.rank;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function matchesFilter(guild, filter) {
  if (filter === "full") return guild.power.full;
  if (filter === "manage") return guild.power.manage;
  if (filter === "mod") return guild.power.mod;
  if (filter === "member") return guild.power.member;
  return true;
}

function matchesSearch(guild, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return guild.name.toLowerCase().includes(q);
}

export function createServerListController(root, { interactive = true, emptyMessages = true } = {}) {
  const nodes = {
    list: field(root, "list"),
    empty: field(root, "empty"),
    emptyTitle: field(root, "empty-title"),
    emptyText: field(root, "empty-text"),
    addBot: field(root, "add-bot"),
    statAll: field(root, "stat-all"),
    statFull: field(root, "stat-full"),
    statManage: field(root, "stat-manage"),
    statMod: field(root, "stat-mod"),
    search: field(root, "search"),
    filterButtons: fields(root, "filter"),
  };

  const state = { guilds: [], filter: "all", query: "" };

  function getVisibleGuilds() {
    return state.guilds
      .filter(g => matchesFilter(g, state.filter) && matchesSearch(g, state.query))
      .sort(sortGuilds);
  }

  function renderStats() {
    setText(nodes.statAll, state.guilds.length);
    setText(nodes.statFull, state.guilds.filter(g => g.power.full).length);
    setText(nodes.statManage, state.guilds.filter(g => g.power.manage).length);
    setText(nodes.statMod, state.guilds.filter(g => g.power.mod).length);
  }

  function renderFilterButtons() {
    for (const button of nodes.filterButtons) {
      const active = button.dataset.srvFilter === state.filter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  function renderEmpty(isFiltered) {
    if (!nodes.empty) return;
    setHidden(nodes.list, true);
    setHidden(nodes.empty, false);

    if (isFiltered) {
      setText(nodes.emptyTitle, t("servers.empty_filter_title"));
      setText(nodes.emptyText, t("servers.empty_filter_text"));
      setHidden(nodes.addBot, true);
      return;
    }

    setText(nodes.emptyTitle, t("servers.empty_title"));
    setText(nodes.emptyText, t("servers.empty_text"));
    setHidden(nodes.addBot, false);
  }

  function render() {
    renderStats();
    renderFilterButtons();

    const visible = getVisibleGuilds();
    const isFiltered = state.guilds.length > 0 && visible.length === 0;

    nodes.list.classList.remove("loading");
    nodes.list.replaceChildren();

    if (emptyMessages && (!state.guilds.length || isFiltered)) {
      renderEmpty(isFiltered);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const guild of visible) {
      fragment.appendChild(buildServerCard(guild, { interactive }));
    }
    nodes.list.appendChild(fragment);

    setHidden(nodes.list, false);
    if (nodes.empty) setHidden(nodes.empty, true);
  }

  function bindEvents() {
    nodes.search?.addEventListener("input", () => {
      state.query = nodes.search.value;
      render();
    });

    for (const button of nodes.filterButtons) {
      button.addEventListener("click", () => {
        state.filter = button.dataset.srvFilter || "all";
        render();
      });
    }
  }

  bindEvents();

  return {
    setGuilds(guilds) {
      state.guilds = guilds;
      render();
    },
    render,
  };
}