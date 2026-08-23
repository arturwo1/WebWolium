export function i18nKey(section, audience, idPath, field) {
  return ["home", section, audience, ...idPath, field].join(".");
}

export function isVisibleForAudience(node, audience) {
  if (!node.audience || node.audience.length === 0) return true;
  return node.audience.includes(audience);
}

export function collectI18nKeys(node, section, idPath = []) {
  const path = [...idPath, node.id];
  const keys = [];

  const audiences = node.audience && node.audience.length ? node.audience : ["admin", "user"];

  if (node.text) {
    for (const field of Object.keys(node.text)) {
      if (!node.text[field]) continue;
      for (const audience of audiences) {
        keys.push(i18nKey(section, audience, path, field));
      }
    }
  }

  if (node.title) {
    for (const audience of audiences) {
      keys.push(i18nKey(section, audience, path, "title"));
    }
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      keys.push(...collectI18nKeys(child, section, path));
    }
  }

  return keys;
}