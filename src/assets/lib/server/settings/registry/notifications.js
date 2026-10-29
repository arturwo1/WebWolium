export const notificationsCategory = {
  id: "notifications",
  titleKey: "server.section_notifications",
  store: "guild_config",
  summary: ({ value, translate }) => translate("server.summary.enabled_count", { count: [value("news"), value("important"), value("critical")].filter(Boolean).length }),
  groups: [
    {
      id: "main",
      presentation: "card",
      fields: [
        { key: "news", type: "toggle", default: false },
        { key: "news_channel", type: "channel", default: "", visibleWhen: { field: "news", truthy: true } },
        { key: "important", type: "toggle", default: false },
        { key: "important_channel", type: "channel", default: "", visibleWhen: { field: "important", truthy: true } },
        { key: "critical", type: "toggle", forcedValue: true, locked: true, default: true },
        { key: "critical_channel", type: "channel", default: "" }
      ]
    }
  ]
};
