import { lsJSONGet, lsJSONSet, lsDel } from "@/lib/storage.js";
import { decompressZlib } from "@/lib/format/compression.js";

const KIND = "get_bunker_user_games";
const MAX_CACHED_PAGES = 12;
const FIRST_PAGE_TTL_MS = 60_000;

export async function decodeBunkerGame(raw, decode = decompressZlib) {
  let payload = null;

  if (raw?.payload_b64) {
    try {
      payload = await decode(raw.payload_b64);
    } catch {
      payload = null;
    }
  }

  return {
    id: String(raw?.id ?? ""),
    guildId: raw?.guild_id != null ? String(raw.guild_id) : null,
    creatorId: raw?.creator_id != null ? String(raw.creator_id) : null,
    status: Number(raw?.status ?? 0),
    createdAt: raw?.created_at ?? null,
    finishedAt: raw?.finished_at ?? null,
    won: Boolean(raw?.won),
    payload
  };
}

export function createBunkerGamesStore({
  queue,
  userId,
  storage = { get: lsJSONGet, set: lsJSONSet, del: lsDel },
  decode = decompressZlib
}) {
  const indexKey = `wolium:bunker:pages:${userId}`;
  const pageKey = (cursor) => `wolium:bunker:page:${userId}:${cursor}`;

  const state = {
    games: [],
    cursor: null,
    hasMore: false,
    loaded: false,
    loading: false,
    error: null
  };

  let inflight = null;

  function readPage(cursor) {
    const page = storage.get(pageKey(cursor), null);
    return page && Array.isArray(page.games) ? page : null;
  }

  function writePage(cursor, page) {
    const key = pageKey(cursor);
    const index = (storage.get(indexKey, []) || []).filter((item) => item !== cursor);
    index.push(cursor);

    while (index.length > MAX_CACHED_PAGES) storage.del(pageKey(index.shift()));

    let stored = storage.set(key, page);
    while (!stored && index.length > 1) {
      storage.del(pageKey(index.shift()));
      stored = storage.set(key, page);
    }

    if (!stored) index.pop();
    storage.set(indexKey, index);
  }

  async function fetchPage(cursor) {
    if (cursor) {
      const cached = readPage(cursor);
      if (cached) return cached;
    }

    const payload = cursor ? { before: cursor } : {};
    const options = cursor
      ? { cacheTtlMs: 0, cooldownMs: 0 }
      : { cacheTtlMs: FIRST_PAGE_TTL_MS, cooldownMs: 1_500 };

    const res = await queue(KIND, payload, options);
    const nextCursor = res?.next_cursor ?? null;

    const page = {
      games: Array.isArray(res?.games) ? res.games : [],
      has_more: Boolean(res?.has_more && nextCursor),
      next_cursor: nextCursor
    };

    if (cursor) writePage(cursor, page);
    return page;
  }

  function run(task) {
    if (inflight) return inflight;

    state.loading = true;
    state.error = null;

    inflight = (async () => {
      try {
        await task();
        return true;
      } catch (e) {
        state.error = e;
        return false;
      } finally {
        state.loading = false;
        inflight = null;
      }
    })();

    return inflight;
  }

  function loadFirst() {
    if (state.loaded) return Promise.resolve(true);

    return run(async () => {
      const page = await fetchPage(null);
      state.games = await Promise.all(page.games.map((game) => decodeBunkerGame(game, decode)));
      state.cursor = page.next_cursor;
      state.hasMore = page.has_more;
      state.loaded = true;
    });
  }

  function loadMore() {
    if (!state.loaded || !state.hasMore || !state.cursor) return Promise.resolve(false);

    return run(async () => {
      const page = await fetchPage(state.cursor);
      const games = await Promise.all(page.games.map((game) => decodeBunkerGame(game, decode)));
      const known = new Set(state.games.map((game) => game.id));
      state.games = [...state.games, ...games.filter((game) => !known.has(game.id))];
      state.cursor = page.next_cursor;
      state.hasMore = page.has_more;
    });
  }

  return { state, loadFirst, loadMore };
}
