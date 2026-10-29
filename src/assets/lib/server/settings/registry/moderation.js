import { createToggleSummary } from "../fieldTypes.js";

export const moderationCategory = {
  id: "moderation",
  titleKey: "server.section_auto_moderation",
  store: "guild_config",
  summary: createToggleSummary("moderation"),
  groups: [
    {
      id: "main",
      presentation: "card",
      fields: [
        { key: "moderation", type: "toggle", master: true, default: false },
        { key: "moderation_type", type: "select", options: ["normal", "AI"], default: "normal" },
        { key: "moderation_whitelist_channels", type: "channels", default: [] },
        { key: "moderation_blacklist_channels", type: "channels", default: [] },
        { key: "rules", type: "text", multiline: true, default: "", visibleWhen: { field: "moderation_type", equals: "AI" } }
      ]
    }
  ]
};
