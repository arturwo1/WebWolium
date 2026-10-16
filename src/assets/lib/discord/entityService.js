import { t } from "@/lib/text/i18n.js";
import { hydrateMentions } from "@/lib/discord/mentions.js";

let current = null;
let unsubscribe = null;

export function setEntityResolver(resolver) {
  unsubscribe?.();
  current = resolver ?? null;
  unsubscribe = current ? current.subscribe(() => hydrateMentions(document, current)) : null;
}

export function getEntityResolver() {
  return current;
}

export function mentionLabels() {
  return {
    user: t("common.user"),
    channel: t("common.channel"),
    role: t("common.role")
  };
}
