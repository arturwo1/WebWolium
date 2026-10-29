import { formatDuration, parseDuration } from "@/lib/format/formatters.js";
import { safeJsonParse } from "@/lib/json.js";
import { escapeHtml } from "@/lib/security/html.js";
import { clamp } from "@/lib/time.js";

const MAX_TTL_SECONDS = 365 * 86400;
const EXACT_UNITS = { maxUnits: 4 };

export class FieldError {
  constructor(messageKey) {
    this.messageKey = messageKey;
  }
}

const limitsOf = (field) => [field.min ?? -Infinity, field.max ?? Infinity];

function numericAttributes(field) {
  const min = field.min === undefined ? "" : ` min="${field.min}"`;
  const max = field.max === undefined ? "" : ` max="${field.max}"`;
  return min + max;
}

export function normalizeRoles(roles) {
  if (Array.isArray(roles)) {
    return roles.map((role) => ({ id: String(role.id ?? role.role_id), name: role.name ?? String(role.id) }));
  }
  return Object.entries(roles ?? {}).map(([id, props]) => ({ id, name: props?.name ?? id }));
}

export function listChoices(field, context) {
  if (field.type === "roles") return normalizeRoles(context.roles);
  const source = field.source ?? "message_channels";
  return Object.entries(context.channels?.[source] ?? {}).map(([id, props]) => ({ id, name: props?.name ?? id }));
}

function choiceName(field, context, id) {
  const choice = listChoices(field, context).find((item) => item.id === id);
  const name = choice?.name ?? id;
  return field.type === "roles" ? name : "#" + name;
}

export function createToggleSummary(fieldKey) {
  return ({ value, translate }) => translate(value(fieldKey) ? "server.settings.on" : "server.settings.off");
}

function parseTtlText(text) {
  const normalized = String(text).trim().toLowerCase();
  const seconds = /^\d+$/.test(normalized) ? NaN : parseDuration(normalized);
  if (Number.isNaN(seconds)) return new FieldError(normalized ? "server.ttl_invalid" : "server.ttl_empty");
  if (seconds === 0) return new FieldError("server.ttl_zero");
  if (seconds > MAX_TTL_SECONDS) return new FieldError("server.ttl_too_long");
  return normalized;
}

function chipsHtml(items, context, sortable = false) {
  const removeLabel = escapeHtml(context.translate("remove"));
  const chips = items.map((item) => `<span class="st-chip${item.missing ? " is-missing" : ""}"${sortable ? ` data-sortable data-value="${escapeHtml(item.id)}"` : ""}>${escapeHtml(item.label)}<button type="button" class="st-chip__remove" data-act="remove-item" data-value="${escapeHtml(item.id)}" aria-label="${removeLabel}">×</button></span>`);
  return `<div class="st-chips">${chips.join("")}</div>`;
}

function appendWords(value, text) {
  const words = text.split(",").map((word) => word.trim()).filter((word) => word && !value.includes(word));
  return words.length ? [...value, ...words] : undefined;
}

const toggle = {
  parse: (raw, field) => field.forcedValue ?? (raw === undefined || raw === null ? Boolean(field.default) : Boolean(raw)),
  serialize: (value) => value,
  format: (value, field, context) => context.translate(value ? "server.settings.on" : "server.settings.off"),
  onChange: (field, value, element) => (field.locked ? value : element.checked)
};

const select = {
  parse: (raw, field) => (field.options.includes(raw) ? raw : field.default),
  serialize: (value) => value,
  format: (value, field, context) => context.translate("server.option_" + String(value).toLowerCase()),
  controlHtml: () => '<div class="st-select" data-select></div>',
  selectConfig: (field, value, context) => ({
    items: field.options.map((option) => ({ key: option, label: context.translate("server.option_" + option.toLowerCase()) })),
    selected: value,
    placeholder: "",
    searchable: false,
    pick: (key) => (field.options.includes(key) ? key : undefined)
  })
};

const count = {
  parse: (raw, field) => {
    const number = Number(raw ?? field.default);
    return clamp(Number.isFinite(number) ? Math.round(number) : field.default, ...limitsOf(field));
  },
  serialize: (value) => value,
  format: (value) => String(value),
  rangeText: (field, context) => (field.min !== undefined && field.max !== undefined ? context.translate("server.settings.range", { min: field.min, max: field.max }) : ""),
  controlHtml: (field, value) => `<input class="input" type="number" inputmode="numeric"${numericAttributes(field)} value="${value}" data-ctl="input">`,
  onChange: (field, value, element) => {
    const number = Number(element.value);
    return element.value !== "" && Number.isFinite(number) ? clamp(Math.round(number), ...limitsOf(field)) : value;
  }
};

const duration = {
  parse: (raw, field) => {
    const seconds = Number(raw ?? field.default);
    return clamp(Number.isFinite(seconds) ? seconds : field.default, ...limitsOf(field));
  },
  serialize: (value) => value,
  format: (value) => formatDuration(value, EXACT_UNITS),
  rangeText: (field, context) => context.translate("server.settings.range", { min: formatDuration(field.min, EXACT_UNITS), max: formatDuration(field.max, EXACT_UNITS) }),
  controlHtml: (field, value) => `<input class="input" type="text" autocapitalize="off" value="${formatDuration(value, EXACT_UNITS)}" placeholder="1d 2h 30m" data-ctl="input">`,
  onChange: (field, value, element) => {
    const seconds = parseDuration(element.value);
    return Number.isNaN(seconds) ? value : clamp(seconds, ...limitsOf(field));
  }
};

const channel = {
  parse: (raw) => (raw === undefined || raw === null ? "" : String(raw)),
  serialize: (value) => value || null,
  format: (value, field, context) => (value ? choiceName(field, context, value) : context.translate(field.emptyKey ?? "server.settings.not_set")),
  controlHtml: (field, value, context) => {
    const clear = value ? `<button type="button" class="st-clear" data-act="clear" aria-label="${escapeHtml(context.translate("server.settings.clear"))}">×</button>` : "";
    return `<div class="st-select-row"><div class="st-select" data-select></div>${clear}</div>`;
  },
  selectConfig: (field, value, context) => {
    const items = listChoices(field, context).map((choice) => ({ key: choice.id, label: "#" + choice.name }));
    if (value && !items.some((item) => item.key === value)) items.unshift({ key: value, label: value });
    return { items, selected: value || null, placeholder: context.translate(field.emptyKey ?? "server.settings.not_set"), pick: (key) => key };
  },
  onAction: () => ""
};

function createMultiType() {
  const type = {
    block: true,
    parse: (raw) => {
      const items = safeJsonParse(raw, []);
      return Array.isArray(items) ? items.map(String) : [];
    },
    serialize: (value) => value,
    format: (value, field, context) => {
      if (!value.length) return context.translate("server.settings.none");
      if (value.length <= 2) return value.map((id) => choiceName(field, context, id)).join(", ");
      return context.translate("server.multi_channel_selected", { count: value.length });
    },
    controlHtml: (field, value, context) => {
      const choices = listChoices(field, context);
      const items = value.map((id) => {
        const choice = choices.find((item) => item.id === id);
        return { id, label: choice ? (field.type === "roles" ? choice.name : "#" + choice.name) : id, missing: !choice };
      });
      const add = choices.some((choice) => !value.includes(choice.id)) ? '<div class="st-select" data-select></div>' : "";
      const chips = items.length ? chipsHtml(items, context) : `<span class="st-empty">${escapeHtml(context.translate("server.settings.none"))}</span>`;
      return chips + add;
    },
    selectConfig: (field, value, context) => ({
      items: listChoices(field, context).filter((choice) => !value.includes(choice.id)).map((choice) => ({ key: choice.id, label: field.type === "roles" ? choice.name : "#" + choice.name })),
      selected: null,
      placeholder: context.translate("server.settings.add"),
      pick: (key) => (value.includes(key) ? undefined : [...value, key])
    }),
    onAction: (field, value, element) => value.filter((id) => id !== element.dataset.value)
  };
  return type;
}

const channels = createMultiType();
const roles = createMultiType();

const list = {
  block: true,
  parse: (raw) => {
    const items = safeJsonParse(raw, []);
    return Array.isArray(items) ? items.map(String) : [];
  },
  serialize: (value) => JSON.stringify(value),
  format: (value, field, context) => value.join(", ") || context.translate("server.settings.none"),
  controlHtml: (field, value, context) => {
    const chips = value.length ? chipsHtml(value.map((word) => ({ id: word, label: word })), context, true) : "";
    return `${chips}<input class="input" type="text" data-ctl="add-word" placeholder="${escapeHtml(context.translate("server.settings.add_word"))}">`;
  },
  onAction: (field, value, element) => value.filter((word) => word !== element.dataset.value),
  onReorder: (field, value, from, to) => {
    const fromIndex = value.indexOf(from);
    const toIndex = value.indexOf(to);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return undefined;
    const next = [...value];
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, from);
    return next;
  },
  onKey: (field, value, element, event) => {
    if (event.key !== "Enter" && event.key !== ",") return undefined;
    event.preventDefault();
    return appendWords(value, element.value);
  },
  onChange: (field, value, element) => appendWords(value, element.value)
};

const text = {
  block: false,
  parse: (raw) => (raw === undefined || raw === null ? "" : String(raw)),
  serialize: (value) => value || null,
  format: (value, field, context) => (value ? value.slice(0, 40) + (value.length > 40 ? "…" : "") : context.translate("server.settings.not_set")),
  controlHtml: (field, value) => (field.multiline
    ? `<textarea class="input st-textarea" data-ctl="input">${escapeHtml(value)}</textarea>`
    : `<input class="input" type="text" value="${escapeHtml(value)}" data-ctl="input">`),
  onChange: (field, value, element) => element.value
};

const ttlMap = {
  block: true,
  parse: (raw) => {
    const map = safeJsonParse(raw, {});
    return map && typeof map === "object" && !Array.isArray(map) ? map : {};
  },
  serialize: (value) => JSON.stringify(value),
  format: (value, field, context) => {
    const total = Object.keys(value).length;
    return total ? context.translate("server.multi_channel_selected", { count: total }) : context.translate("server.settings.none");
  },
  validate: (field, value) => {
    for (const ttl of Object.values(value)) {
      const parsed = parseTtlText(ttl);
      if (parsed instanceof FieldError) return parsed.messageKey;
    }
    return null;
  },
  controlHtml: (field, value, context) => {
    const channelField = { type: "channel", source: "message_channels" };
    const choices = listChoices(channelField, context);
    const rows = Object.entries(value).map(([id, ttl]) => `<div class="st-ttl-row" data-channel-id="${escapeHtml(id)}"><span>${escapeHtml(choiceName(channelField, context, id))}</span><input class="input" type="text" value="${escapeHtml(ttl)}" data-ctl="ttl"><button type="button" class="st-chip__remove" aria-label="${escapeHtml(context.translate("remove"))}" data-act="remove">×</button></div>`).join("");
    const empty = rows ? "" : `<div class="st-empty">${escapeHtml(context.translate("server.ttl_no_channels"))}</div>`;
    return `${rows}${empty}<div class="st-ttl-row"><div class="st-select" data-select></div><input class="input" type="text" placeholder="1d 2h 30m" data-ttl-value><button type="button" class="btn" data-act="add">${escapeHtml(context.translate("server.ttl_add"))}</button></div>`;
  },
  selectConfig: (field, value, context) => ({
    items: listChoices({ type: "channel", source: "message_channels" }, context).filter((choice) => value[choice.id] === undefined).map((choice) => ({ key: choice.id, label: "#" + choice.name })),
    selected: null,
    placeholder: context.translate("chart.preset.channel"),
    pick: (key, host) => {
      host.dataset.picked = key;
      return undefined;
    }
  }),
  onChange: (field, value, element) => {
    const parsed = parseTtlText(element.value);
    if (parsed instanceof FieldError) return parsed;
    return { ...value, [element.closest("[data-channel-id]").dataset.channelId]: parsed };
  },
  onAction: (field, value, element, scope) => {
    if (element.dataset.act === "remove") {
      const next = { ...value };
      delete next[element.closest("[data-channel-id]").dataset.channelId];
      return next;
    }
    const channelId = scope.querySelector("[data-select]").dataset.picked;
    if (!channelId) return new FieldError("server.ttl_pick_channel_err");
    const parsed = parseTtlText(scope.querySelector("[data-ttl-value]").value);
    return parsed instanceof FieldError ? parsed : { ...value, [channelId]: parsed };
  }
};

export const fieldTypes = { toggle, select, count, duration, channel, channels, roles, list, text, ttlMap };
