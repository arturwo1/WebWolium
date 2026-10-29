import { aiCategory } from "./ai.js";
import { bunkerCategory } from "./bunker.js";
import { gamesCategory, logsCategory, privacyCategory, ttlCategory } from "./general.js";
import { moderationCategory } from "./moderation.js";
import { notificationsCategory } from "./notifications.js";

export const settingsRegistry = [
  logsCategory,
  moderationCategory,
  aiCategory,
  gamesCategory,
  bunkerCategory,
  notificationsCategory,
  ttlCategory,
  privacyCategory
];
