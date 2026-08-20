export default function () {
  return {
    wolium: [
      {
        id: "moderation",
        display: "carousel",
        category: "moderation",
        audience: ["admin"],
        title: true,
        meta: { infinite: true },
        children: [
          {
            id: "ai-moderation",
            display: "leaf",
            audience: ["admin"],
            reveal: "modal",
            text: { teaser: true, short: true, full: true },
            meta: {},
          },
          {
            id: "manual-moderation",
            display: "accordion",
            audience: ["admin"],
            title: true,
            children: [
              { id: "ban", display: "leaf", audience: ["admin"], reveal: "modal", text: { teaser: true, short: true, full: true }, meta: { command: "/ban", danger: true } },
              { id: "unban", display: "leaf", audience: ["admin"], reveal: "modal", text: { teaser: true, short: true, full: true }, meta: { command: "/unban" } },
              { id: "mute", display: "leaf", audience: ["admin"], reveal: "modal", text: { teaser: true, short: true, full: true }, meta: { command: "/mute", danger: true } },
              { id: "unmute", display: "leaf", audience: ["admin"], reveal: "modal", text: { teaser: true, short: true }, meta: { command: "/unmute" } },
              { id: "kick", display: "leaf", audience: ["admin"], reveal: "modal", text: { teaser: true, short: true, full: true }, meta: { command: "/kick", danger: true } },
              { id: "purge", display: "leaf", audience: ["admin"], reveal: "modal", text: { teaser: true, short: true, full: true }, meta: { command: "/purge", danger: true } },
              { id: "settings", display: "leaf", audience: ["admin"], reveal: "modal", text: { teaser: true, short: true, full: true }, meta: { command: "/settings", media: "https://i.imgur.com/2IV5uIK.gif" } },
            ],
          },
          {
            id: "reports-panel",
            display: "leaf",
            audience: ["admin"],
            reveal: "modal",
            text: { teaser: true, short: true, full: true },
            meta: {},
          },
          {
            id: "ai-chatbot",
            display: "leaf",
            audience: ["admin"],
            reveal: "modal",
            text: { teaser: true, short: true, full: true },
            meta: { media: "https://i.imgur.com/LaFzeyM.gif" },
          },
        ],
      },

      {
        id: "analytics",
        display: "grid",
        category: "analytics",
        audience: ["admin"],
        title: true,
        children: [
          { id: "message-tracking", display: "leaf", audience: ["admin"], reveal: "modal", text: { teaser: true, short: true }, meta: {} },
          { id: "voice-tracking", display: "leaf", audience: ["admin"], reveal: "modal", text: { teaser: true, short: true }, meta: {} },
          { id: "activity-tracking", display: "leaf", audience: ["admin"], reveal: "modal", text: { teaser: true, short: true }, meta: {} },
          { id: "member-join-leave", display: "leaf", audience: ["admin"], reveal: "modal", text: { teaser: true, short: true }, meta: {} },
          { id: "graph-command", display: "leaf", audience: ["admin"], reveal: "modal", text: { teaser: true, short: true, full: true }, meta: { command: "/graph", media: "https://i.imgur.com/eXffc8p.png" } },
        ],
      },

      {
        id: "privacy",
        display: "accordion",
        category: "privacy",
        audience: ["user"],
        title: true,
        children: [
          { id: "delete-data", display: "leaf", audience: ["user"], reveal: "modal", text: { teaser: true, short: true, full: true }, meta: { command: "/delete_data" } },
          { id: "insert-data", display: "leaf", audience: ["user"], reveal: "modal", text: { teaser: true, short: true, full: true }, meta: { command: "/insert_data" } },
          { id: "privacy-settings", display: "leaf", audience: ["user"], reveal: "modal", text: { teaser: true, short: true }, meta: { command: "/privacy" } },
        ],
      },

      {
        id: "economy",
        display: "accordion",
        category: "economy",
        audience: ["user"],
        title: true,
        children: [
          { id: "work", display: "leaf", audience: ["user"], reveal: "modal", text: { teaser: true, short: true, full: true }, meta: { command: "/work", media: "https://i.imgur.com/I9VddZd.png" } },
          { id: "transaction", display: "leaf", audience: ["user"], reveal: "modal", text: { teaser: true, short: true, full: true }, meta: { command: "/transaction", media: "https://i.imgur.com/plufMB3.png" } },
        ],
      },

      {
        id: "economy-overview",
        display: "leaf",
        category: "economy",
        audience: ["admin"],
        reveal: "modal",
        text: { teaser: true, short: true, full: true },
        meta: {},
      },

      {
        id: "games",
        display: "accordion",
        category: "fun",
        audience: ["admin", "user"],
        title: true,
        children: [
          { id: "word-game", display: "leaf", audience: ["admin", "user"], reveal: "modal", text: { teaser: true, short: true, full: true }, meta: {} },
          { id: "count-game", display: "leaf", audience: ["admin", "user"], reveal: "modal", text: { teaser: true, short: true, full: true }, meta: {} },
        ],
      },

      {
        id: "tools",
        display: "accordion",
        category: "tools",
        audience: ["admin", "user"],
        title: true,
        children: [
          { id: "translate", display: "leaf", audience: ["admin", "user"], reveal: "tooltip", text: { teaser: true, short: true }, meta: { command: "/translate" } },
          { id: "link", display: "leaf", audience: ["admin", "user"], reveal: "modal", text: { teaser: true, short: true }, meta: { command: "/link" } },
          { id: "format-numbers", display: "leaf", audience: ["admin", "user"], reveal: "tooltip", text: { teaser: true, short: true, full: true }, meta: { command: "/format_numbers" } },
          { id: "holiday", display: "leaf", audience: ["admin", "user"], reveal: "modal", text: { teaser: true, short: true, full: true }, meta: { command: "/holiday" } },
          { id: "language", display: "leaf", audience: ["admin", "user"], reveal: "tooltip", text: { teaser: true, short: true }, meta: { command: "/language" } },
          { id: "help", display: "leaf", audience: ["admin", "user"], reveal: "modal", text: { teaser: true, short: true, full: true }, meta: { command: "/help" } },
        ],
      },

      {
        id: "fun",
        display: "leaf",
        category: "fun",
        audience: ["user"],
        reveal: "modal",
        text: { teaser: true, short: true, full: true },
        meta: { command: "/text" },
      },

      { id: "report-message", display: "leaf", category: "moderation", audience: ["user"], reveal: "modal", text: { teaser: true, short: true, full: true }, meta: { command: "message_report" } },
      { id: "report-user", display: "leaf", category: "moderation", audience: ["user"], reveal: "modal", text: { teaser: true, short: true, full: true }, meta: { command: "user_report" } },

      { id: "profile-admin-view", display: "leaf", category: "social", audience: ["admin"], reveal: "modal", text: { teaser: true, short: true }, meta: { command: "/profile" } },
      { id: "profile-user-view", display: "leaf", category: "social", audience: ["user"], reveal: "modal", text: { teaser: true, short: true, full: true }, meta: { command: "/profile", media: "https://i.imgur.com/rMAJKrq.png" } },

      { id: "leaderboard-admin-view", display: "leaf", category: "social", audience: ["admin"], reveal: "modal", text: { teaser: true, short: true }, meta: { command: "/leaders" } },
      { id: "leaderboard-user-view", display: "leaf", category: "social", audience: ["user"], reveal: "modal", text: { teaser: true, short: true, full: true }, meta: { command: "/leaders", media: "https://i.imgur.com/vskBMTK.png" } },

      { id: "moderation-notice-user", display: "leaf", category: "moderation", audience: ["user"], reveal: "tooltip", text: { teaser: true, short: true }, meta: {} },

      {
        id: "faq",
        display: "accordion",
        category: "tools",
        audience: ["admin", "user"],
        title: true,
        children: [
          { id: "ai-not-responding", display: "leaf", audience: ["admin", "user"], reveal: "modal", text: { teaser: true, short: true }, meta: {} },
          { id: "find-channel-id", display: "leaf", audience: ["admin", "user"], reveal: "modal", text: { teaser: true, short: true }, meta: {} },
          { id: "insert-data-folder-not-found", display: "leaf", audience: ["user"], reveal: "modal", text: { teaser: true, short: true }, meta: {} },
          { id: "insert-data-wrong-format", display: "leaf", audience: ["user"], reveal: "modal", text: { teaser: true, short: true }, meta: {} },
          { id: "bot-error-screenshot", display: "leaf", audience: ["admin", "user"], reveal: "modal", text: { teaser: true, short: true }, meta: {} },
          { id: "bot-not-responding", display: "leaf", audience: ["admin", "user"], reveal: "modal", text: { teaser: true, short: true }, meta: {} },
        ],
      },
    ],

    webwolium: [
      { id: "server-settings", display: "leaf", category: "privacy", audience: ["admin"], reveal: "none", text: { teaser: true, short: true, full: true }, meta: { widget: "settings-demo" } },
      { id: "servers-list-admin", display: "leaf", category: "social", audience: ["admin"], reveal: "none", text: { teaser: true, short: true }, meta: { widget: "servers-demo" } },

      { id: "chart", display: "leaf", category: "analytics", audience: ["user"], reveal: "none", text: { teaser: true, short: true, full: true }, meta: { widget: "chart-demo" } },
      { id: "leaderboard-page", display: "leaf", category: "social", audience: ["user"], reveal: "none", text: { teaser: true, short: true, full: true }, meta: { widget: "leaderboard-demo" } },
      { id: "profile-page", display: "leaf", category: "social", audience: ["user"], reveal: "none", text: { teaser: true, short: true, full: true }, meta: { widget: "profile-demo" } },
      { id: "server-page", display: "leaf", category: "social", audience: ["user"], reveal: "none", text: { teaser: true, short: true, full: true }, meta: { widget: "server-demo" } },
      { id: "servers-list-user", display: "leaf", category: "social", audience: ["user"], reveal: "none", text: { teaser: true, short: true }, meta: { widget: "servers-demo" } },
      { id: "account-settings", display: "leaf", category: "privacy", audience: ["user"], reveal: "none", text: { teaser: true, short: true, full: true }, meta: { widget: "settings-account-demo" } },
    ],
  };
}
