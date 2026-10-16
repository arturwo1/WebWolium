import { t, onLangChange } from "@/lib/text/i18n.js";
import { createCustomSelect } from "@/lib/ui/customSelect.js";
import { BUNKER_TABS, renderGameCard, renderGameChips, renderTab } from "@/lib/bunker/bunkerView.js";
import { collectBunkerParams } from "@/lib/bunker/bunkerUrlState.js";
import { getEntityResolver } from "@/lib/discord/entityService.js";
import { isSnowflake } from "@/lib/discord/entities.js";

const MAX_SEEK_PAGES = 5;

export function createBunkerPanel({ root, createStore, getGuildName = null, onStateChange = null }) {
  if (!root) return null;

  const part = (name) => root.querySelector(`[data-bunker="${name}"]`);
  const bodyEl = part("body");
  const selectRoot = part("select");
  const chipsEl = part("chips");
  const tabsEl = part("tabs");
  const scrollEl = part("scroll");
  const contentEl = part("content");
  const stateEl = part("state");
  const retryBtn = part("retry");
  if (!bodyEl || !selectRoot || !chipsEl || !tabsEl || !scrollEl || !contentEl || !stateEl || !retryBtn) return null;

  const tabButtons = Array.from(tabsEl.querySelectorAll("[data-bunker-tab]"));

  let store = null;
  let meId = null;
  let failed = false;
  let opened = false;
  let selectedId = null;
  let wantedId = null;
  let activeTab = "story";

  const ctx = () => ({ t, meId, guildName: getGuildName, entities: getEntityResolver() });

  function seedEntities(game) {
    const entities = getEntityResolver();
    if (!entities || !game?.payload) return;

    for (const [id, player] of Object.entries(game.payload.players ?? {})) {
      if (isSnowflake(id) && typeof player?.name === "string") entities.seed("user", id, { name: player.name });
    }

    const guildName = game.guildId ? getGuildName?.(game.guildId) : null;
    if (guildName) entities.seed("guild", game.guildId, { name: guildName });
  }
  const notify = () => onStateChange?.();

  const select = createCustomSelect({
    root: selectRoot,
    ariaLabel: t("bunker.select.label"),
    getKey: (game) => game.id,
    renderOption: (game) => renderGameCard(game, ctx()),
    onChange: (game) => {
      selectedId = game.id;
      renderDetail(true);
      notify();
    },
    onFooter: loadMore
  });

  function currentGame() {
    return store?.state.games.find((game) => game.id === selectedId) ?? null;
  }

  function renderState() {
    const s = store?.state;
    const games = s?.games ?? [];
    const loadFailed = failed || Boolean(s && !s.loaded && s.error);

    let message = "";
    if (loadFailed) message = t("bunker.error");
    else if (!s || !s.loaded) message = t("loading");
    else if (!games.length) message = t("bunker.empty");

    stateEl.textContent = message;
    stateEl.hidden = !message;
    retryBtn.hidden = !loadFailed;
    retryBtn.disabled = Boolean(s?.loading);
    retryBtn.textContent = t("bunker.retry");
    bodyEl.hidden = !games.length;
  }

  function syncSelect() {
    const s = store?.state;
    const games = s?.games ?? [];

    select.setItems(games);

    if (games.length && !games.some((game) => game.id === selectedId)) selectedId = games[0].id;
    if (selectedId) select.select(selectedId, { silent: true });

    select.setFooter(s?.loaded && s.hasMore ? { text: t("bunker.load_more"), busy: Boolean(s.loading) } : null);
  }

  function renderDetail(resetScroll) {
    const game = currentGame();

    tabButtons.forEach((button) => {
      const active = button.dataset.bunkerTab === activeTab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });

    if (!game) {
      chipsEl.replaceChildren();
      contentEl.replaceChildren();
      return;
    }

    seedEntities(game);
    chipsEl.replaceChildren(renderGameChips(game, ctx()));
    contentEl.replaceChildren(renderTab(activeTab, game, ctx()));
    if (resetScroll) scrollEl.scrollTop = 0;
  }

  function render() {
    renderState();
    syncSelect();
    renderDetail(false);
  }

  async function loadMore() {
    if (!store) return;
    const pending = store.loadMore();
    syncSelect();
    await pending;
    syncSelect();
  }

  async function seekWanted() {
    const id = wantedId;
    wantedId = null;
    if (!id || !store) return;

    let pages = 0;
    while (!store.state.games.some((game) => game.id === id) && store.state.hasMore && pages < MAX_SEEK_PAGES) {
      await store.loadMore();
      pages++;
      if (store.state.error) break;
    }

    if (store.state.games.some((game) => game.id === id)) selectedId = id;
  }

  async function ensureLoaded() {
    if (!store) {
      try {
        const created = await createStore();
        if (created) {
          store = created.store;
          meId = created.meId ?? null;
          failed = false;
        } else {
          failed = true;
        }
      } catch {
        failed = true;
      }

      if (!store) {
        render();
        return;
      }
    }

    render();

    if (!store.state.loaded) {
      const pending = store.loadFirst();
      render();
      await pending;
    }

    await seekWanted();
    render();
    renderDetail(true);
    notify();
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.bunkerTab;
      if (!BUNKER_TABS.includes(id) || id === activeTab) return;
      activeTab = id;
      renderDetail(true);
      notify();
    });
  });

  retryBtn.addEventListener("click", async () => {
    if (!store) {
      failed = false;
      render();
      await ensureLoaded();
      return;
    }

    const pending = store.loadFirst();
    render();
    await pending;
    await seekWanted();
    render();
    renderDetail(true);
    notify();
  });

  onLangChange(() => {
    if (!opened) return;
    select.refresh();
    renderState();
    renderDetail(false);
  });

  return {
    async show({ game = null, view = null } = {}) {
      opened = true;
      if (game) wantedId = game;
      if (view && BUNKER_TABS.includes(view)) activeTab = view;
      await ensureLoaded();
    },
    getParams: () => collectBunkerParams({ game: selectedId, view: activeTab })
  };
}
