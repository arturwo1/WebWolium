import { ROUND_PHASE_KEYS, roundSeconds } from "@/lib/bunker/bunkerModel.js";
import { formatDuration } from "@/lib/format/formatters.js";

const roundSecondsOf = (value) => roundSeconds(Object.fromEntries(ROUND_PHASE_KEYS.map((key) => [key, value(key)])));

function describeRound({ value, translate }) {
  return translate("server.summary.bunker_round", { time: formatDuration(roundSecondsOf(value), { maxUnits: 4 }) });
}

export const bunkerCategory = {
  id: "bunker",
  titleKey: "server.section_bunker",
  store: "guild_settings_bunker",
  summary: ({ value, translate }) => `${translate("server.option_" + value("launch_access"))} · ${translate("server.summary.bunker_players", { count: value("max_players") })} · ${describeRound({ value, translate })}`,
  groups: [
    {
      id: "access",
      titleKey: "server.group_bunker_access",
      presentation: "card",
      fields: [
        { key: "launch_access", type: "select", options: ["admins", "everyone", "roles"], default: "admins" },
        { key: "launch_role_ids", type: "roles", default: [], visibleWhen: { field: "launch_access", equals: "roles" } }
      ]
    },
    {
      id: "channels",
      titleKey: "server.group_bunker_channels",
      presentation: "card",
      fields: [
        { key: "category_id", type: "channel", source: "category_channels", emptyKey: "server.settings.auto", default: "" }
      ]
    },
    {
      id: "players",
      titleKey: "server.group_bunker_players",
      presentation: "link",
      summary: ({ value, translate }) => `${translate("server.summary.bunker_players", { count: value("max_players") })} · ${value("bunker_capacity")}`,
      fields: [
        { key: "max_players", type: "count", min: 4, max: 20, default: 12 },
        { key: "bunker_capacity", type: "count", min: 2, max: 10, default: 4 },
        { key: "extra_traits_count", type: "count", min: 0, max: 5, default: 3 }
      ]
    },
    {
      id: "timings",
      titleKey: "server.group_bunker_timings",
      presentation: "link",
      summary: describeRound,
      fields: [
        { key: "game_duration", type: "duration", min: 1800, max: 259200, default: 86400 },
        { key: "trait_selection_duration", type: "duration", min: 15, max: 300, default: 60 },
        { key: "discussion_duration", type: "duration", min: 30, max: 600, default: 120 },
        { key: "voting_duration", type: "duration", min: 15, max: 300, default: 60 },
        { key: "round_pause_duration", type: "duration", min: 5, max: 120, default: 15 }
      ]
    }
  ]
};
