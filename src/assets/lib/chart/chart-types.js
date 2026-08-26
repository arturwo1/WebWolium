import { formatNumber, formatDuration, t } from "@/lib/index.js";
import * as r from "./chart-renderers.js";

function readPositiveInt(inputEl) {
  const raw = String(inputEl?.value ?? "").trim();
  if (!raw) return null;

  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0;

  return Math.floor(n);
}

export const TYPE_REGISTRY = {
  user_messages: {
    kind: "user_messages_series",

    filterIds: ["chartGuildId", "chartChannelId", "chartContext"],

    buildPayload({ from, to, bucketMs, limit }, els) {
      return {
        from,
        to,
        bucket_ms: bucketMs,
        limit,
        guild_id: els.chartGuildId?.value || "",
        channel_id: els.chartChannelId?.value || "",
        context: els.chartContext?.value || ""
      };
    },

    tipVal(p) {
      return `${t("profile.messages")}: ${formatNumber(p.y)}`;
    },

    renderPreview(p, viewer) {
      return r.renderUserMessagePreview(p, viewer);
    },

    summaryText(series) {
      if (!series.length) return t("chart.summary.messages", { count: 0 });
      const sum = series.reduce((a, p) => a + (p.y || 0), 0);
      return t("chart.summary.messages", { count: formatNumber(sum) });
    },

    onPointClick(point) {
      if (Math.round(point.y) !== 1) return;
      const url = point?.sample_url;
      if (url && typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  },

  user_voice: {
    kind: "user_voice_series",

    filterIds: ["chartGuildId", "chartChannelId", "chartVoiceMinDuration", "chartVoiceMaxDuration", "chartJumpBox"],

    buildPayload({ from, to, bucketMs, limit }, els) {
      return {
        from,
        to,
        bucket_ms: bucketMs,
        limit,
        guild_id: els.chartGuildId?.value || "",
        channel_id: els.chartChannelId?.value || "",
        min_duration_seconds: readPositiveInt(els.chartVoiceMinDuration),
        max_duration_seconds: readPositiveInt(els.chartVoiceMaxDuration),
        only_jumps: els.chartJump?.checked || false
      };
    },

    tipVal(p) {
      return `${t("profile.voice")}: ${formatDuration(p.y || 0)}`;
    },

    renderPreview(p) {
      return r.renderUserVoicePreview(p);
    },

    summaryText(series) {
      if (!series.length) return t("chart.summary.time", { value: "00:00" });
      const sum = series.reduce((a, p) => a + (p.y || 0), 0);
      return t("chart.summary.time", { value: formatDuration(sum) });
    },

    onPointClick(point) {
      if (Math.round(point?.count ?? point?.meta?.total_bucket_count) !== 1) return;
      const url = point?.meta?.after_channel_url || point?.meta?.before_channel_url;
      if (url && typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  },

  user_activities: {
    kind: "user_activities_series",

    filterIds: [
      "chartActivityName",
      "chartActivityStatus",
      "chartActivityMinDuration",
      "chartActivityMaxDuration",
      "chartActivityMore",
      "chartActivityTrack",
      "chartActivityAlbum",
      "chartActivityArtist"
    ],

    buildPayload({ from, to, bucketMs, limit }, els) {
      return {
        from,
        to,
        bucket_ms: bucketMs,
        limit,
        activity_name: els.chartActivityName?.value || "",
        status: els.chartActivityStatus?.value || "",
        min_duration_seconds: readPositiveInt(els.chartActivityMinDuration),
        max_duration_seconds: readPositiveInt(els.chartActivityMaxDuration),
        track: els.chartActivityTrack?.value || "",
        album: els.chartActivityAlbum?.value || "",
        artist: els.chartActivityArtist?.value || ""
      };
    },

    tipVal(p) {
      return `${t("profile.time")}: ${formatDuration(p.y || 0)}`;
    },

    renderPreview(p, viewer) {
      return r.renderUserActivityPreview(p, viewer);
    },

    summaryText(series) {
      if (!series.length) return t("chart.summary.time", { value: "00:00" });
      const sum = series.reduce((a, p) => a + (p.y || 0), 0);
      return t("chart.summary.time", { value: formatDuration(sum) });
    },

    onPointClick() { }
  },

  user_commands: {
    kind: "user_commands_series",

    filterIds: ["chartGuildId", "chartChannelId", "chartCommandName"],

    buildPayload({ from, to, bucketMs, limit }, els) {
      return {
        from,
        to,
        bucket_ms: bucketMs,
        limit,
        guild_id: els.chartGuildId?.value || "",
        channel_id: els.chartChannelId?.value || "",
        command_name: els.chartCommandName?.value || ""
      };
    },

    tipVal(p) {
      return `${t("profile.commands")}: ${formatNumber(p.y)}`;
    },

    renderPreview(p, viewer) {
      return r.renderUserCommandsPreview(p, viewer);
    },

    summaryText(series) {
      if (!series.length) return t("chart.summary.commands", { count: 0 });
      const sum = series.reduce((a, p) => a + (p.y || 0), 0);
      return t("chart.summary.commands", { count: formatNumber(sum) });
    },

    onPointClick() { }
  },

  guild_messages: {
    kind: "guild_messages_series",

    filterIds: ["chartChannelId", "chartRoleId"],

    buildPayload({ from, to, bucketMs, limit, guildId }, els) {
      return {
        from,
        to,
        bucket_ms: bucketMs,
        limit,
        channel_id: els.chartChannelId?.value || "",
        role_id: els.chartRoleId?.value || "",
        guild_id: guildId || ""
      };
    },

    tipVal(p) {
      return `${t("profile.messages")}: ${formatNumber(p.y)}`;
    },

    renderPreview(p, viewer) {
      return r.renderGuildMessagePreview(p, viewer);
    },

    summaryText(series) {
      if (!series.length) return t("chart.summary.messages", { count: 0 });
      const sum = series.reduce((a, p) => a + (p.y || 0), 0);
      return t("chart.summary.messages", { count: formatNumber(sum) });
    },

    onPointClick(point) {
      if (Math.round(point.y) !== 1) return;
      const url = point?.sample_url;
      if (url && typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  },

  guild_voice: {
    kind: "guild_voice_series",

    filterIds: ["chartChannelId", "chartRoleId", "chartVoiceMinDuration", "chartVoiceMaxDuration", "chartJumpBox"],

    buildPayload({ from, to, bucketMs, limit, guildId }, els) {
      return {
        from,
        to,
        bucket_ms: bucketMs,
        limit,
        guild_id: guildId || "",
        channel_id: els.chartChannelId?.value || "",
        role_id: els.chartRoleId?.value || "",
        min_duration_seconds: readPositiveInt(els.chartVoiceMinDuration),
        max_duration_seconds: readPositiveInt(els.chartVoiceMaxDuration),
        only_jumps: els.chartJump?.checked || false
      };
    },

    tipVal(p) {
      return `${t("profile.voice")}: ${formatDuration(p.y || 0)}`;
    },

    renderPreview(p) {
      return r.renderGuildVoicePreview(p);
    },

    summaryText(series) {
      if (!series.length) return t("chart.summary.time", { value: "00:00" });
      const sum = series.reduce((a, p) => a + (p.y || 0), 0);
      return t("chart.summary.time", { value: formatDuration(sum) });
    },

    onPointClick(point) {
      if (Math.round(point?.count ?? point?.meta?.total_bucket_count) !== 1) return;
      const url = point?.meta?.after_channel_url || point?.meta?.before_channel_url;
      if (url && typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  },

  guild_activities: {
    kind: "guild_activities_series",

    filterIds: [
      "chartActivityName",
      "chartActivityStatus",
      "chartActivityMinDuration",
      "chartActivityMaxDuration"
    ],

    buildPayload({ from, to, bucketMs, limit, guildId }, els) {
      return {
        guild_id: guildId,
        from,
        to,
        bucket_ms: bucketMs,
        limit,
        activity_name: els.chartActivityName?.value || "",
        status: els.chartActivityStatus?.value || "",
        min_duration_seconds: readPositiveInt(els.chartActivityMinDuration),
        max_duration_seconds: readPositiveInt(els.chartActivityMaxDuration)
      };
    },

    tipVal(p) {
      return `${t("profile.time")}: ${formatDuration(p.y || 0)}`;
    },

    renderPreview(p) {
      return r.renderGuildActivityPreview(p);
    },

    summaryText(series) {
      if (!series.length) return t("chart.summary.time", { value: "00:00" });
      const sum = series.reduce((a, p) => a + (p.y || 0), 0);
      return t("chart.summary.time", { value: formatDuration(sum) });
    },

    onPointClick() { }
  },

  guild_members: {
    kind: "guild_members_series",

    filterIds: [],

    buildPayload({ from, to, bucketMs, limit, guildId }) {
      return {
        guild_id: guildId,
        from,
        to,
        bucket_ms: bucketMs,
        limit
      };
    },

    tipVal(p) {
      return `${t("server.analytics.members")}: ${formatNumber(p?.y ?? 0)}`;
    },

    renderPreview(p) {
      return r.renderGuildMembersPreview(p);
    },

    summaryText(series) {
      const last = series.at(-1);

      return t("chart.summary.members", {
        count: formatNumber(last?.y ?? 0)
      });
    },

    onPointClick() { }
  },

};

export function resolveType(type) {
  return TYPE_REGISTRY[type] ?? TYPE_REGISTRY.user_messages;
}

export function normalizeType(type) {
  return TYPE_REGISTRY[type] ? type : "user_messages";
}