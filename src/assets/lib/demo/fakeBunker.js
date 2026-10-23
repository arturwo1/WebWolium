import en from "@/locales/en.json";
import { pick } from "@/lib/demo/rng.js";
import { DEMO_USER_NAMES, DEMO_CHANNEL_NAMES, DEMO_MESSAGES } from "@/lib/demo/demoNames.js";
import { getLang, getSupportedLangs, t } from "@/lib/text/i18n.js";
import { TRAIT_FIELDS, parseReveal, traitValues } from "@/lib/bunker/bunkerModel.js";

const LOCALE_KEYS = Object.keys(en);
const GAMES_COUNT = 2;
const HOUR = 3600;
const DAY = 86400;

const TRAIT_POOLS = {
  profession: "bunker_config.professions.",
  gender: "bunker_config.genders.",
  health: "bunker_config.health_conditions.",
  hobby: "bunker_config.hobbies.",
  phobia: "bunker_config.phobias.",
  skill: "bunker_config.skills.",
  baggage: "bunker_config.baggage."
};

const SETTING_LIMITS = {
  max_players: [4, 20, 1],
  bunker_capacity: [2, 10, 1],
  extra_traits_count: [0, 5, 1],
  game_duration: [1800, 259200, 60],
  trait_selection_duration: [15, 300, 5],
  discussion_duration: [30, 600, 5],
  voting_duration: [15, 300, 5],
  round_pause_duration: [5, 120, 5]
};

const poolOf = (prefix) => LOCALE_KEYS.filter((key) => key.startsWith(prefix));
const slugsOf = (prefix) => poolOf(prefix).map((key) => key.slice(prefix.length)).filter((slug) => !slug.includes("."));

const SCENARIOS = LOCALE_KEYS
  .map((key) => /^bunker_config\.scenario\.([^.]+)\.type$/.exec(key)?.[1])
  .filter(Boolean);

const DIFFICULTIES = slugsOf("bunker.difficulty.");
const END_REASONS = slugsOf("bunker.end_reason.");
const SWITCH_VALUES = slugsOf("bunker.value.");
const MULTI_TRAITS = TRAIT_FIELDS.filter((spec) => spec.field.endsWith("_keys"));

function between(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function shuffled(rng, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function sampleKeys(rng, prefix, count) {
  return shuffled(rng, poolOf(prefix)).slice(0, count);
}

function randomDigits(rng, length) {
  return Array.from({ length }, (_, i) => String(i === 0 ? between(rng, 1, 9) : between(rng, 0, 9))).join("");
}

function randomHex(rng, length) {
  return Array.from({ length }, () => between(rng, 0, 15).toString(16)).join("");
}

function stamp(seconds) {
  return new Date(seconds * 1000).toISOString().slice(0, 19).replace("T", " ");
}

function plainTrait(text) {
  return String(text).split(/\s[—–]\s/)[0];
}

function listOf(items) {
  const lang = getLang();
  const locale = lang === "ua" ? "uk" : lang;
  return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(items);
}

function buildSettings(rng) {
  const settings = {};

  for (const [key, [min, max, step]] of Object.entries(SETTING_LIMITS)) {
    settings[key] = min + step * Math.floor(rng() * ((max - min) / step + 1));
  }

  const [capacityMin, capacityMax] = SETTING_LIMITS.bunker_capacity;
  settings.bunker_capacity = between(rng, capacityMin, Math.min(capacityMax, settings.max_players - 2));
  settings.anonymity = pick(rng, SWITCH_VALUES);
  settings.catastrophe_mode = pick(rng, SWITCH_VALUES);
  settings.ai_story = "on";

  return settings;
}

function buildCard(rng, extraTraits) {
  const card = {};

  for (const spec of TRAIT_FIELDS) {
    if (spec.category === "age") {
      card.age = between(rng, 18, 80);
    } else if (spec.category === "gender") {
      card.gender_key = pick(rng, poolOf(TRAIT_POOLS.gender));
      card.orientation_key = pick(rng, poolOf(TRAIT_POOLS.orientation));
    } else {
      card[spec.field] = sampleKeys(rng, TRAIT_POOLS[spec.category], 1);
    }
  }

  for (let i = 0; i < extraTraits; i++) {
    const spec = pick(rng, MULTI_TRAITS);
    const known = card[spec.field];
    const options = poolOf(TRAIT_POOLS[spec.category]).filter((key) => !known.includes(key));
    if (options.length) known.push(pick(rng, options));
  }

  return card;
}

function pickReveal(rng, card, taken) {
  const options = TRAIT_FIELDS
    .flatMap((spec) => traitValues(card, spec).map((_, index) => `${spec.category}:${index}`))
    .filter((id) => !taken.has(id));

  if (!options.length) return null;

  const choice = pick(rng, options);
  taken.add(choice);
  return choice;
}

function castVotes(rng, participants) {
  const votes = {};

  for (const voter of participants) {
    votes[voter] = pick(rng, participants.filter((id) => id !== voter));
  }

  const counts = new Map();
  for (const target of Object.values(votes)) counts.set(target, (counts.get(target) ?? 0) + 1);

  const top = Math.max(...counts.values());
  const tied = [...counts.entries()].filter(([, count]) => count === top).map(([id]) => id);

  return { votes, tied: tied.length > 1 ? tied : [], eliminated: pick(rng, tied) };
}

function chatPhase(rng, speakers, from, to, count) {
  const messages = Array.from({ length: count }, () => ({
    at: between(rng, from, Math.max(from, to - 1)),
    speaker: pick(rng, speakers),
    text: pick(rng, DEMO_MESSAGES)
  }));

  return {
    messages: messages
      .sort((a, b) => a.at - b.at)
      .map((message) => ({ [message.speaker]: `${stamp(message.at)} - ${message.text}` }))
  };
}

function variantOf(rng, prefix) {
  return between(rng, 0, poolOf(prefix).length - 1);
}

function renderStory(plan) {
  const plain = (key) => plainTrait(t(key));
  const names = (keys) => listOf(keys.map(plain));

  const votes = plan.eliminated.map((item) => t(`bunker_demo.story.out.${item.variant}`, {
    name: item.name,
    round: item.round,
    profession: plain(item.profession)
  }));

  const survivors = plan.survivors.map((item) => t(`bunker_demo.story.survivor.${item.variant}`, {
    name: item.name,
    profession: plain(item.profession),
    skill: plain(item.skill),
    baggage: plain(item.baggage)
  }));

  return [
    `## ${t(plan.catastrophe.type)}`,
    t(plan.catastrophe.history),
    `## ${t("bunker_demo.story.h_bunker")}`,
    t(`bunker_demo.story.bunker.${plan.bunker.variant}`, {
      description: t(plan.bunker.description),
      equipment: names(plan.bunker.equipment),
      problems: names(plan.bunker.problems)
    }),
    `## ${t("bunker_demo.story.h_votes")}`,
    ...votes,
    `## ${t("bunker_demo.story.h_survivors")}`,
    ...survivors,
    t(`bunker_demo.story.outro.${plan.outro}`)
  ].join("\n\n");
}

function buildGame(rng, now, meId) {
  const settings = buildSettings(rng);
  const capacity = settings.bunker_capacity;
  const total = between(rng, capacity + 2, settings.max_players);
  const botCount = between(rng, 1, total - 1);
  const names = shuffled(rng, DEMO_USER_NAMES).slice(0, total);
  const roles = shuffled(rng, Array.from({ length: total }, (_, i) => i < botCount));
  const ids = roles.map((isBot) => (isBot ? `bot-${randomHex(rng, 8)}` : randomDigits(rng, 18)));
  const humanSlots = roles.map((isBot, index) => (isBot ? -1 : index)).filter((index) => index >= 0);
  ids[pick(rng, humanSlots)] = meId;

  const players = {};
  ids.forEach((id, index) => {
    players[id] = { name: names[index], bot: roles[index], card: buildCard(rng, settings.extra_traits_count) };
  });

  const introSeconds = settings.discussion_duration;
  const roundSeconds = settings.trait_selection_duration + settings.discussion_duration + settings.voting_duration + settings.round_pause_duration;
  const roundsCount = total - capacity;
  const durationSeconds = introSeconds + roundsCount * roundSeconds;
  const finishedAt = Math.floor(now / 1000) - between(rng, HOUR, 3 * DAY);
  const startedAt = finishedAt - durationSeconds;

  settings.game_duration = Math.max(settings.game_duration, Math.ceil(durationSeconds / 60) * 60);

  const alive = new Set(ids);
  const taken = Object.fromEntries(ids.map((id) => [id, new Set()]));
  const rounds = {};
  const eliminatedOrder = [];

  for (let number = 1; alive.size > capacity; number++) {
    const roundStart = startedAt + introSeconds + (number - 1) * roundSeconds;
    const participants = ids.filter((id) => alive.has(id));
    const reveals = {};

    for (const id of participants) {
      const choice = pickReveal(rng, players[id].card, taken[id]);
      if (choice) reveals[id] = choice;
    }

    const revealEnd = roundStart + settings.trait_selection_duration;
    const discussionEnd = revealEnd + settings.discussion_duration;
    const votingEnd = discussionEnd + settings.voting_duration;
    const outcome = castVotes(rng, participants);
    const phases = {};

    if (number === 1) phases.initial_discussion = chatPhase(rng, participants, roundStart - introSeconds, roundStart, between(rng, 2, 5));

    phases.reveal = { ...chatPhase(rng, participants, roundStart, revealEnd, between(rng, 0, 2)), reveals };
    phases.discussion = chatPhase(rng, participants, revealEnd, discussionEnd, between(rng, 2, 8));
    phases.voting = {
      ...chatPhase(rng, participants, discussionEnd, votingEnd, between(rng, 0, 2)),
      votes: outcome.votes,
      tied: outcome.tied,
      eliminated: outcome.eliminated
    };
    phases.pause = chatPhase(rng, [outcome.eliminated], votingEnd, votingEnd + settings.round_pause_duration, between(rng, 0, 1));

    rounds[number] = { started_at: roundStart, phases };
    eliminatedOrder.push({ id: outcome.eliminated, round: number });
    alive.delete(outcome.eliminated);
  }

  const finalists = ids.filter((id) => alive.has(id));
  const scenario = pick(rng, SCENARIOS);
  const scenarioKey = (field) => `bunker_config.scenario.${scenario}.${field}`;
  const firstOf = (id, field) => pick(rng, players[id].card[field]);

  const plan = {
    catastrophe: { type: scenarioKey("type"), history: scenarioKey("history") },
    bunker: {
      variant: variantOf(rng, "bunker_demo.story.bunker."),
      description: pick(rng, poolOf("bunker_config.bunker_descriptions.")),
      equipment: sampleKeys(rng, "bunker_config.equipment.", between(rng, 2, 6)),
      problems: sampleKeys(rng, "bunker_config.problems.", between(rng, 1, 4))
    },
    eliminated: eliminatedOrder.map((item) => ({
      name: players[item.id].name,
      round: item.round,
      profession: firstOf(item.id, "profession_keys"),
      variant: variantOf(rng, "bunker_demo.story.out.")
    })),
    survivors: finalists.map((id) => ({
      name: players[id].name,
      profession: firstOf(id, "profession_keys"),
      skill: firstOf(id, "skill_keys"),
      baggage: firstOf(id, "baggage_keys"),
      variant: variantOf(rng, "bunker_demo.story.survivor.")
    })),
    title: variantOf(rng, "bunker_demo.story.title."),
    teaser: variantOf(rng, "bunker_demo.story.teaser."),
    outro: variantOf(rng, "bunker_demo.story.outro.")
  };

  const ai = {
    get title() {
      return t(`bunker_demo.story.title.${plan.title}`, { catastrophe: t(plan.catastrophe.type) });
    },
    get teaser() {
      return t(`bunker_demo.story.teaser.${plan.teaser}`, { survivors: listOf(plan.survivors.map((item) => item.name)) });
    },
    get story() {
      return renderStory(plan);
    }
  };

  const payload = {
    players,
    finalists,
    rounds,
    ai,
    settings,
    started_at: startedAt,
    finished_at: finishedAt,
    difficulty: pick(rng, DIFFICULTIES),
    end_reason: pick(rng, END_REASONS),
    lang: pick(rng, getSupportedLangs()),
    discord: { channel_name: pick(rng, DEMO_CHANNEL_NAMES) },
    catastrophe: {
      slug: scenario,
      type_key: scenarioKey("type"),
      description_key: scenarioKey("description"),
      history_key: scenarioKey("history"),
      years: between(rng, 1, 40)
    },
    bunker: {
      description_key: plan.bunker.description,
      capacity,
      rounds: roundsCount,
      food_years: between(rng, 1, 15),
      water_years: between(rng, 1, 15),
      equipment_keys: plan.bunker.equipment,
      problem_keys: plan.bunker.problems
    }
  };

  return {
    id: `demo-${randomHex(rng, 10)}`,
    guildId: null,
    creatorId: meId,
    status: 2,
    createdAt: startedAt - between(rng, 30, 900),
    finishedAt,
    won: alive.has(meId),
    payload
  };
}

export function generateFakeBunkerGames(rng, now = Date.now()) {
  const meId = randomDigits(rng, 18);
  const games = Array.from({ length: GAMES_COUNT }, () => buildGame(rng, now, meId)).sort((a, b) => b.finishedAt - a.finishedAt);

  return { games, meId };
}

export function createFakeBunkerStore(games) {
  const state = {
    games,
    cursor: null,
    hasMore: false,
    loaded: false,
    loading: false,
    error: null
  };

  return {
    state,
    loadFirst() {
      state.loaded = true;
      return Promise.resolve(true);
    },
    loadMore() {
      return Promise.resolve(false);
    }
  };
}
