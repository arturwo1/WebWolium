export const FLAGS_OPTIONS = {
  normal: "server.option_normal",
  ai: "server.option_ai",
  extreme: "server.option_extreme",
};

export const CONFIG_SCHEMA = {
  mod_log_channel: { type: "channel", channelType: "message_channels", label: "server.flag_mod_log_channel", tooltip: "server.tooltip_mod_log_channel" },

  moderation: { type: "boolean", label: "server.flag_moderation", tooltip: "server.tooltip_moderation" },
  moderation_whitelist_channels: { type: "multi_channel", channelType: "message_channels", label: "server.flag_moderation_whitelist_channels", tooltip: "server.tooltip_moderation_whitelist_channels" },
  moderation_blacklist_channels: { type: "multi_channel", channelType: "message_channels", label: "server.flag_moderation_blacklist_channels", tooltip: "server.tooltip_moderation_blacklist_channels" },
  moderation_type: { type: "select", label: "server.flag_moderation_type", tooltip: "server.tooltip_moderation_type", options: [{ v: "normal", t: FLAGS_OPTIONS.normal }, { v: "AI", t: FLAGS_OPTIONS.ai }] },
  rules: { type: "textarea", label: "server.flag_rules", tooltip: "server.tooltip_rules" },

  aibot: { type: "boolean", label: "server.flag_aibot", tooltip: "server.tooltip_aibot" },
  aibot_whitelist_channels: { type: "multi_channel", channelType: "message_channels", label: "server.flag_aibot_whitelist_channels", tooltip: "server.tooltip_aibot_whitelist_channels" },
  aibot_blacklist_channels: { type: "multi_channel", channelType: "message_channels", label: "server.flag_aibot_blacklist_channels", tooltip: "server.tooltip_aibot_blacklist_channels" },
  ai_message_delete: { type: "boolean", label: "server.flag_ai_message_delete", tooltip: "server.tooltip_ai_message_delete" },
  ai_message_ttl: { type: "number", label: "server.flag_ai_message_ttl", tooltip: "server.tooltip_ai_message_ttl" },
  ai_long_message_ttl: { type: "number", label: "server.flag_ai_long_message_ttl", tooltip: "server.tooltip_ai_long_message_ttl" },

  word_channel: { type: "channel", channelType: "message_channels", label: "server.flag_word_channel", tooltip: "server.tooltip_word_channel" },
  words: { type: "json_array", label: "server.flag_words", tooltip: "server.tooltip_words" },
  filter: { type: "select", label: "server.flag_filter", tooltip: "server.tooltip_filter", options: [{ v: "normal", t: FLAGS_OPTIONS.normal }, { v: "extreme", t: FLAGS_OPTIONS.extreme }] },
  number_channel: { type: "channel", channelType: "message_channels", label: "server.flag_number_channel", tooltip: "server.tooltip_number_channel" },

  news: { type: "boolean", label: "server.flag_news", tooltip: "server.tooltip_news" },
  news_channel: { type: "channel", channelType: "message_channels", label: "server.flag_news_channel", tooltip: "server.tooltip_news_channel" },
  important: { type: "boolean", label: "server.flag_important", tooltip: "server.tooltip_important" },
  important_channel: { type: "channel", channelType: "message_channels", label: "server.flag_important_channel", tooltip: "server.tooltip_important_channel" },
  critical: { type: "boolean", label: "server.flag_critical", disabled: true, forcedValue: true, tooltip: "server.tooltip_critical" },
  critical_channel: { type: "channel", channelType: "message_channels", label: "server.flag_critical_channel", tooltip: "server.tooltip_critical_channel" },

  ttl_channel: { type: "ttl_map", label: "server.flag_ttl_channel", tooltip: "server.tooltip_ttl_channel" },

  save_messages: { type: "boolean", label: "server.flag_save_messages", tooltip: "server.tooltip_save_messages" },
  save_voice: { type: "boolean", label: "server.flag_save_voice", tooltip: "server.tooltip_save_voice" },
  save_activity: { type: "boolean", label: "server.flag_save_activity", tooltip: "server.tooltip_save_activity" },
};

export const SECTION_ORDER = ["log_channels", "auto_moderation", "ai", "games", "notifications", "ttl", "privacy"];

export const SECTION_LABELS = {
  log_channels: "server.section_log_channels",
  auto_moderation: "server.section_auto_moderation",
  ai: "server.section_ai",
  games: "server.section_games",
  notifications: "server.section_notifications",
  ttl: "server.section_ttl",
  privacy: "server.section_privacy",
};

export const SECTION_FLAGS = {
  log_channels: ["mod_log_channel"],
  auto_moderation: ["moderation", "moderation_whitelist_channels", "moderation_blacklist_channels", "moderation_type", "rules"],
  ai: ["aibot", "aibot_whitelist_channels", "aibot_blacklist_channels", "ai_message_delete", "ai_message_ttl", "ai_long_message_ttl"],
  games: ["word_channel", "words", "filter", "number_channel"],
  notifications: ["news", "news_channel", "important", "important_channel", "critical", "critical_channel"],
  ttl: ["ttl_channel"],
  privacy: ["save_messages", "save_voice", "save_activity"],
};

const TTL_RE = /^(?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s\s*)?$/;

function parseTtlMap(val) {
  if (!val) return {};
  if (typeof val === "object" && !Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return {}; }
}

export function validateTtl(str, translate) {
  const s = str.trim();
  if (!s) return { ok: false, msg: translate("server.ttl_empty") };
  if (!TTL_RE.test(s)) return { ok: false, msg: translate("server.ttl_invalid") };
  const [, d, h, m, sec] = s.match(TTL_RE).map(Number);
  const totalSec = (d || 0) * 86400 + (h || 0) * 3600 + (m || 0) * 60 + (sec || 0);
  if (totalSec === 0) return { ok: false, msg: translate("server.ttl_zero") };
  if (totalSec > 365 * 86400) return { ok: false, msg: translate("server.ttl_too_long") };
  return { ok: true };
}

export function createTtlEditor(key, currentChannels, initialValue, translate) {
  const ttlMap = parseTtlMap(initialValue || "{}");

  const root = document.createElement("div");
  root.className = "ttl-editor";

  const list = document.createElement("div");
  list.className = "ttl-list";

  function renderList() {
    list.innerHTML = "";
    const entries = Object.entries(ttlMap);

    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "ttl-empty";
      empty.textContent = translate("server.ttl_no_channels");
      list.appendChild(empty);
      return;
    }

    entries.forEach(([chId, ttlStr]) => {
      const chName = currentChannels[chId]?.name || chId;

      const row = document.createElement("div");
      row.className = "ttl-row";

      const nameEl = document.createElement("span");
      nameEl.className = "ttl-row__name";
      nameEl.textContent = `#${chName}`;

      const input = document.createElement("input");
      input.type = "text";
      input.className = "input ttl-row__input";
      input.value = ttlStr;
      input.placeholder = "e.g. 1d 2h";
      input.name = `ttl__${chId}`;

      const errEl = document.createElement("span");
      errEl.className = "ttl-row__err";
      errEl.hidden = true;

      input.addEventListener("input", () => {
        const { ok, msg } = validateTtl(input.value, translate);
        errEl.hidden = ok;
        errEl.textContent = msg || "";
        if (ok) ttlMap[chId] = input.value.trim();
      });

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "ttl-row__remove";
      removeBtn.title = translate("remove");
      removeBtn.innerHTML = `<svg class="icon"><use href="#close"></use></svg>`;
      removeBtn.addEventListener("click", () => {
        delete ttlMap[chId];
        renderListAndSync();
      });

      row.append(nameEl, input, errEl, removeBtn);
      list.appendChild(row);
    });
  }

  const addRow = document.createElement("div");
  addRow.className = "ttl-add-row";

  const channelSelect = document.createElement("select");
  channelSelect.className = "input ttl-add__select";

  const defOpt = document.createElement("option");
  defOpt.value = "";
  defOpt.textContent = translate("chart.preset.channel");
  channelSelect.appendChild(defOpt);

  const ttlInput = document.createElement("input");
  ttlInput.type = "text";
  ttlInput.className = "input ttl-add__value";
  ttlInput.placeholder = "1d 2h 30m";

  const addErrEl = document.createElement("span");
  addErrEl.className = "ttl-row__err";
  addErrEl.hidden = true;

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn-preset ttl-add__btn";
  addBtn.textContent = translate("server.ttl_add");

  function renderListAndSync() {
    renderList();

    [...channelSelect.options].forEach(opt => {
      if (opt.value && ttlMap[opt.value] !== undefined) opt.remove();
    });

    Object.entries(currentChannels).forEach(([chId, chProps]) => {
      if (ttlMap[chId] !== undefined) return;
      if (channelSelect.querySelector(`option[value="${chId}"]`)) return;
      const opt = document.createElement("option");
      opt.value = chId;
      opt.textContent = `#${chProps?.name || chId}`;
      channelSelect.appendChild(opt);
    });
  }

  addBtn.addEventListener("click", () => {
    const chId = channelSelect.value;
    const ttlStr = ttlInput.value.trim();

    if (!chId) {
      addErrEl.textContent = translate("server.ttl_pick_channel_err");
      addErrEl.hidden = false;
      return;
    }

    const { ok, msg } = validateTtl(ttlStr, translate);
    if (!ok) {
      addErrEl.textContent = msg;
      addErrEl.hidden = false;
      return;
    }

    addErrEl.hidden = true;
    ttlMap[chId] = ttlStr;
    ttlInput.value = "";
    renderListAndSync();
  });

  addRow.append(channelSelect, ttlInput, addBtn, addErrEl);

  root.append(list, addRow);
  renderListAndSync();

  root._getTtlValue = () => JSON.stringify(ttlMap);
  return root;
}

export function createInputField(key, schema, val, labelText, idsChannels, translate) {
  if (schema.type === "boolean") {
    const wrapper = document.createElement("label");
    wrapper.className = "input";
    wrapper.style.cursor = schema.disabled ? "not-allowed" : "pointer";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = key;
    checkbox.checked = schema.forcedValue !== undefined ? schema.forcedValue : Boolean(val);
    if (schema.disabled) checkbox.disabled = true;

    wrapper.appendChild(checkbox);

    if (labelText) {
      const textSpan = document.createElement("span");
      textSpan.textContent = labelText;
      wrapper.appendChild(textSpan);

      if (schema.tooltip) {
        const infoIcon = document.createElement("span");
        infoIcon.style.cursor = "help";
        infoIcon.title = translate(schema.tooltip);
        infoIcon.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#info"></use></svg>`;
        wrapper.appendChild(infoIcon);
      }
    }

    return wrapper;
  }

  if (schema.type === "select") {
    const select = document.createElement("select");
    select.className = "input";
    select.name = key;
    schema.options.forEach(opt => {
      const option = document.createElement("option");
      option.value = opt.v;
      option.textContent = translate(opt.t);
      if (opt.v === val) option.selected = true;
      select.appendChild(option);
    });
    return select;
  }

  if (schema.type === "multi_channel") {
    const wrapper = document.createElement("div");
    wrapper.className = "multi-channel-input";

    const channels = idsChannels?.[schema.channelType] || {};

    let selected = Array.isArray(val) ? val.map(String) : [];

    const summary = document.createElement("button");
    summary.type = "button";
    summary.className = "multi-channel-summary";

    const list = document.createElement("div");
    list.className = "multi-channel-list";

    const updateSummary = () => {
      summary.textContent = translate("server.multi_channel_selected", { count: list.querySelectorAll("input:checked").length });
    };

    for (const [chId, chProps] of Object.entries(channels)) {
      const label = document.createElement("label");
      label.className = "multi-channel-option";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = key;
      checkbox.value = chId;
      checkbox.checked = selected.includes(String(chId));

      checkbox.addEventListener("change", updateSummary);

      const text = document.createElement("span");
      text.textContent = chProps?.name || chId;

      label.append(checkbox, text);
      list.appendChild(label);
    }

    summary.addEventListener("click", () => {
      wrapper.classList.toggle("is-open");
    });

    wrapper.append(summary, list);
    updateSummary();

    return wrapper;
  }

  if (schema.type === "channel") {
    const select = document.createElement("select");
    select.className = "input";
    select.name = key;

    const defOpt = document.createElement("option");
    defOpt.value = "";
    defOpt.textContent = translate("chart.preset.channel");
    select.appendChild(defOpt);

    const channels = idsChannels?.[schema.channelType] || {};
    for (const [chId, chProps] of Object.entries(channels)) {
      const option = document.createElement("option");
      option.value = chId;
      option.textContent = chProps?.name || chId;
      if (chId === String(val)) option.selected = true;
      select.appendChild(option);
    }
    return select;
  }

  if (schema.type === "textarea") {
    const textarea = document.createElement("textarea");
    textarea.className = "input";
    textarea.name = key;
    textarea.style.minHeight = "120px";
    textarea.value = String(val ?? "");
    return textarea;
  }

  const input = document.createElement("input");
  input.className = "input";
  input.name = key;

  if (schema.type === "number") {
    input.type = "number";
    input.min = "0";
    input.placeholder = "0";
    input.value = val !== undefined && val !== null ? String(val) : "";
  }

  if (schema.type === "json_array") {
    input.type = "text";
    try {
      const parsed = typeof val === "string" ? JSON.parse(val) : val;
      input.value = Array.isArray(parsed) ? parsed.join(", ") : "";
    } catch { input.value = String(val ?? ""); }
  }

  if (schema.type === "ttl_map") {
    const channels = idsChannels?.message_channels ?? {};
    return createTtlEditor(key, channels, val, translate);
  }

  return input;
}

export function buildServerSettingsForm(containerEl, configData, idsChannels, translate) {
  if (!containerEl) return;
  containerEl.innerHTML = "";

  for (const sectionKey of SECTION_ORDER) {
    const flags = SECTION_FLAGS[sectionKey];
    if (!flags?.length) continue;

    const sectionDiv = document.createElement("div");
    sectionDiv.className = "privacy-section";
    sectionDiv.dataset.sectionKey = sectionKey;

    const title = document.createElement("h3");
    title.className = "privacy-section__title";
    title.textContent = translate(SECTION_LABELS[sectionKey]);
    sectionDiv.appendChild(title);

    const flagsContainer = document.createElement("div");
    flagsContainer.className = "privacy-flags";

    for (const flagKey of flags) {
      const schema = CONFIG_SCHEMA[flagKey];
      if (!schema) continue;

      const row = document.createElement("div");
      row.className = "server-control-row";
      row.style.display = "flex";
      row.style.flexDirection = "column";
      row.style.gap = "4px";

      const fieldContainer = document.createElement("div");
      fieldContainer.className = "server-control-field";

      if (schema.type === "boolean") {
        fieldContainer.appendChild(createInputField(flagKey, schema, configData[flagKey], translate(schema.label), idsChannels, translate));
        row.appendChild(fieldContainer);
      } else {
        const label = document.createElement("label");
        label.className = "input server-control-label";
        label.style.fontWeight = "600";
        label.style.fontSize = "14px";

        const labelTextSpan = document.createElement("span");
        labelTextSpan.textContent = translate(schema.label);
        label.appendChild(labelTextSpan);

        if (schema.tooltip) {
          const infoIcon = document.createElement("span");
          infoIcon.style.cursor = "help";
          infoIcon.style.fontSize = "initial";
          infoIcon.style.fontWeight = "initial";
          infoIcon.title = translate(schema.tooltip);
          infoIcon.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#info"></use></svg>`;
          label.appendChild(infoIcon);
        }

        row.appendChild(label);
        fieldContainer.appendChild(createInputField(flagKey, schema, configData[flagKey], "", idsChannels, translate));
        row.appendChild(fieldContainer);
      }

      flagsContainer.appendChild(row);
    }

    sectionDiv.appendChild(flagsContainer);
    containerEl.appendChild(sectionDiv);
  }
}

export function collectFormPayload(containerEl, formEl) {
  const formData = new FormData(formEl);
  const payload = {};

  for (const [key, schema] of Object.entries(CONFIG_SCHEMA)) {
    if (schema.forcedValue !== undefined) { 
      payload[key] = schema.forcedValue; 
      continue; 
    }

    if (schema.type === "boolean") {
      payload[key] = formData.has(key);
    } else if (schema.type === "number") {
      const rawNum = formData.get(key);
      const parsedNum = parseInt(rawNum, 10);
      payload[key] = isNaN(parsedNum) || parsedNum <= 0 ? 0 : parsedNum;
    } else if (schema.type === "json_array") {
      const rawValue = formData.get(key) || "";
      payload[key] = JSON.stringify(rawValue.split(",").map(s => s.trim()).filter(Boolean));
    } else if (schema.type === "ttl_map") {
      const ttlEditor = containerEl.querySelector(".ttl-editor");
      payload[key] = ttlEditor?._getTtlValue?.() ?? "{}";
    } else if (schema.type === "multi_channel") {
      payload[key] = formData.getAll(key);
    } else {
      payload[key] = formData.get(key) || null;
    }
  }

  return payload;
}