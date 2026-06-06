import { formatNumber, formatDuration, t } from "@/lib/index.js";
import {
  renderMessagePreview,
  renderVoicePreview,
  renderActivityPreview,
  renderCommandsPreview
} from "./chart-renderers.js";

function readPositiveInt(inputEl) {
  const raw = String(inputEl?.value ?? "").trim();
  if (!raw) return null;

  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0;

  return Math.floor(n);
}

export const TYPE_REGISTRY = {
  messages: {
    kind: "messages_series",

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
      return renderMessagePreview(p, viewer);
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

  voice: {
    kind: "voice_series",

    filterIds: ["chartGuildId", "chartChannelId", "chartVoiceMinDuration", "chartVoiceMaxDuration"],

    buildPayload({ from, to, bucketMs, limit }, els) {
      return {
        from,
        to,
        bucket_ms: bucketMs,
        limit,
        guild_id: els.chartGuildId?.value || "",
        channel_id: els.chartChannelId?.value || "",
        min_duration_seconds: readPositiveInt(els.chartVoiceMinDuration),
        max_duration_seconds: readPositiveInt(els.chartVoiceMaxDuration)
      };
    },

    tipVal(p) {
      return `${t("profile.voice")}: ${formatDuration(p.y || 0)}`;
    },

    renderPreview(p) {
      return renderVoicePreview(p);
    },

    summaryText(series) {
      if (!series.length) return t("chart.summary.time", { value: "00:00" });
      const sum = series.reduce((a, p) => a + (p.y || 0), 0);
      return t("chart.summary.time", { value: formatDuration(sum) });
    },

    onPointClick() {}
  },

  activities: {
    kind: "activities_series",

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
      return renderActivityPreview(p, viewer);
    },

    summaryText(series) {
      if (!series.length) return t("chart.summary.time", { value: "00:00" });
      const sum = series.reduce((a, p) => a + (p.y || 0), 0);
      return t("chart.summary.time", { value: formatDuration(sum) });
    },

    onPointClick() {}
  },

  commands: {
    kind: "commands_series",

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
      return renderCommandsPreview(p, viewer);
    },

    summaryText(series) {
      if (!series.length) return t("chart.summary.commands", { count: 0 });
      const sum = series.reduce((a, p) => a + (p.y || 0), 0);
      return t("chart.summary.commands", { count: formatNumber(sum) });
    },

    onPointClick() {}
  }
};

export function resolveType(type) {
  return TYPE_REGISTRY[type] ?? TYPE_REGISTRY.messages;
}

export function normalizeType(type) {
  return TYPE_REGISTRY[type] ? type : "messages";
}