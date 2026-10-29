export const logsCategory = {
  id: "logs",
  titleKey: "server.section_log_channels",
  store: "guild_config",
  summary: ({ value, translate }) => (value("mod_log_channel") ? translate("server.summary.log_channel_set") : translate("server.settings.not_set")),
  groups: [
    {
      id: "main",
      presentation: "card",
      fields: [{ key: "mod_log_channel", type: "channel", default: "" }]
    }
  ]
};

export const gamesCategory = {
  id: "games",
  titleKey: "server.section_games",
  store: "guild_config",
  summary: ({ value, translate }) => translate("server.summary.enabled_count", { count: [value("word_channel"), value("number_channel")].filter(Boolean).length }),
  groups: [
    {
      id: "main",
      presentation: "card",
      fields: [
        { key: "word_channel", type: "channel", default: "" },
        { key: "words", type: "list", default: [] },
        { key: "filter", type: "select", options: ["normal", "extreme"], default: "normal" },
        { key: "number_channel", type: "channel", default: "" }
      ]
    }
  ]
};

export const ttlCategory = {
  id: "ttl",
  titleKey: "server.section_ttl",
  store: "guild_config",
  summary: ({ value, translate }) => translate("server.summary.channels_count", { count: Object.keys(value("ttl_channel")).length }),
  groups: [
    {
      id: "main",
      presentation: "card",
      fields: [{ key: "ttl_channel", type: "ttlMap", default: {} }]
    }
  ]
};

export const privacyCategory = {
  id: "privacy",
  titleKey: "server.section_privacy",
  store: "guild_config",
  summary: ({ value, translate }) => translate("server.summary.enabled_count", { count: [value("save_messages"), value("save_voice"), value("save_activity")].filter(Boolean).length }),
  groups: [
    {
      id: "main",
      presentation: "card",
      fields: [
        { key: "save_messages", type: "toggle", default: false },
        { key: "save_voice", type: "toggle", default: false },
        { key: "save_activity", type: "toggle", default: false }
      ]
    }
  ]
};
