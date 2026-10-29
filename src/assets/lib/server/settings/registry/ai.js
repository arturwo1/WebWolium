import { createToggleSummary } from "../fieldTypes.js";

export const aiCategory = {
  id: "ai",
  titleKey: "server.section_ai",
  store: "guild_config",
  summary: createToggleSummary("aibot"),
  groups: [
    {
      id: "main",
      presentation: "card",
      fields: [
        { key: "aibot", type: "toggle", master: true, default: false },
        { key: "aibot_whitelist_channels", type: "channels", default: [] },
        { key: "aibot_blacklist_channels", type: "channels", default: [] },
        { key: "ai_message_delete", type: "toggle", default: false },
        { key: "ai_message_ttl", type: "count", min: 0, default: 0, visibleWhen: { field: "ai_message_delete", truthy: true } },
        { key: "ai_long_message_ttl", type: "count", min: 0, default: 0, visibleWhen: { field: "ai_message_delete", truthy: true } }
      ]
    }
  ]
};
