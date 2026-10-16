import { BUNKER_TABS } from "@/lib/bunker/bunkerModel.js";

const GAME_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const BUNKER_PARAM_KEYS = ["game", "view"];

export function readBunkerParams(search) {
  const out = {};
  const game = search.get("game");
  const view = search.get("view");
  if (game && GAME_RE.test(game)) out.game = game;
  if (view && BUNKER_TABS.includes(view)) out.view = view;
  return out;
}

export function collectBunkerParams({ game, view }) {
  const out = {};
  if (game) out.game = String(game);
  if (view && view !== "story") out.view = view;
  return out;
}
