import { renderDiscordMarkdownToHtml } from "@/lib/text/discordMarkdown.js";
import { formatDiscordTime } from "@/lib/format/datetime.js";
import { formatDuration } from "@/lib/format/formatters.js";
import { BUNKER_TABS, buildPlayers, buildRounds, gameSummary, humanizeSlug, playerName, settingsOf } from "@/lib/bunker/bunkerModel.js";
import { avatarFor, channelHref, createMentionResolvers, guildHref } from "@/lib/discord/mentions.js";

const MESSAGE_LIMIT = 30;

export { BUNKER_TABS };

const SNOWFLAKE_RE = /^\d{15,25}$/;

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = text;
  return el;
}

function translated(ctx, key, vars) {
  const text = ctx.t(key, vars);
  return text && text !== key ? text : null;
}

export function keyText(key, ctx) {
  return translated(ctx, key) ?? String(key);
}

function enumText(group, slug, ctx) {
  return translated(ctx, `bunker.${group}.${slug}`) ?? humanizeSlug(slug);
}

function catastropheName(catastrophe, ctx) {
  return catastrophe.type_key ? keyText(catastrophe.type_key, ctx) : humanizeSlug(catastrophe.slug);
}

function traitText(item, ctx) {
  if (!item) return "";
  if (item.key) {
    const main = keyText(item.key, ctx);
    if (item.orientationKey) {
      return `${main} | ${keyText(item.orientationKey, ctx)}`;
    }
    return main;
  }
  return String(item.value ?? "");
}

function emptyState(ctx, key) {
  return node("div", "bunker__state", ctx.t(key));
}

function chip(text, className = "chip") {
  return node("span", className, text);
}

function linkChip(text, href, { external = false, entity = null } = {}) {
  const el = href ? node("a", "chip chip--link", text) : chip(text);
  if (href) {
    el.href = href;
    if (external) {
      el.target = "_blank";
      el.rel = "noopener noreferrer";
    }
  }
  if (entity) {
    el.setAttribute("data-entity", `${entity.kind}:${entity.id}`);
    el.setAttribute("data-prefix", entity.prefix ?? "");
  }
  return el;
}

function nameChip(id, game, ctx) {
  const name = playerName(game.payload, id) ?? String(id);
  return chip(name, id === ctx.meId ? "chip chip--name chip--me" : "chip chip--name");
}

function guildIdOf(game) {
  return typeof game.guildId === "string" && SNOWFLAKE_RE.test(game.guildId) ? game.guildId : null;
}

function serverChip(game, ctx) {
  const guildId = guildIdOf(game);
  if (!guildId) return null;
  ctx.entities?.request("guild", guildId)?.catch?.(() => { });
  const name = ctx.entities?.peek("guild", guildId)?.name ?? ctx.guildName?.(guildId) ?? ctx.t("bunker.server_fallback", { id: guildId });
  return linkChip(name, guildHref(guildId), { entity: { kind: "guild", id: guildId, prefix: "" } });
}

function channelChip(game, ctx) {
  const channelName = game.payload?.discord?.channel_name;
  const guildId = guildIdOf(game);
  const rawId = game.payload?.discord?.channel_id;
  const channelId = typeof rawId === "string" && SNOWFLAKE_RE.test(rawId) ? rawId : null;

  if (channelId) ctx.entities?.request("channel", channelId, { guildId })?.catch?.(() => { });
  const name = (channelId && ctx.entities?.peek("channel", channelId)?.name) || channelName;
  if (!name) return null;

  return linkChip(`#${name}`, channelHref(guildId, channelId), {
    external: true,
    entity: channelId ? { kind: "channel", id: channelId, prefix: "#" } : null
  });
}

export function renderGameCard(game, ctx) {
  const summary = gameSummary(game);
  const item = node("div", "bunker__item");
  const main = node("div", "bunker__main");
  const parts = [formatDiscordTime(game.finishedAt ?? game.createdAt)];

  if (summary.playersCount) parts.push(ctx.t("bunker.players_count", { count: summary.playersCount }));
  if (summary.difficulty) parts.push(enumText("difficulty", summary.difficulty, ctx));

  main.append(
    node("div", "bunker__title", summary.title ?? ctx.t("bunker.untitled")),
    node("div", "bunker__meta", parts.filter(Boolean).join(" · "))
  );

  const badge = node(
    "div",
    game.won ? "bunker__badge bunker__badge--won" : "bunker__badge",
    game.won ? ctx.t("bunker.won") : ctx.t("bunker.lost")
  );

  item.append(main, badge);
  return item;
}

export function renderGameChips(game, ctx) {
  const wrap = node("div", "bunker__chips");
  const summary = gameSummary(game);
  const chips = [serverChip(game, ctx), channelChip(game, ctx)];

  if (summary.catastrophe) chips.push(chip(catastropheName({ slug: summary.catastrophe, type_key: summary.catastropheKey }, ctx)));
  if (summary.years != null) chips.push(chip(ctx.t("bunker.years", { count: summary.years })));
  if (summary.difficulty) chips.push(chip(enumText("difficulty", summary.difficulty, ctx)));
  if (summary.playersCount) chips.push(chip(ctx.t("bunker.players_count", { count: summary.playersCount })));
  if (summary.roundsCount) chips.push(chip(ctx.t("bunker.rounds_count", { count: summary.roundsCount })));

  wrap.append(...chips.filter(Boolean));
  return wrap;
}

function mentionResolvers(game, ctx) {
  return createMentionResolvers({
    entities: ctx.entities ?? null,
    guildId: guildIdOf(game),
    labels: {
      user: ctx.t("bunker.mention.user"),
      channel: ctx.t("bunker.mention.channel"),
      role: ctx.t("bunker.mention.role")
    },
    fallbackName: (id) => playerName(game.payload, id)
  });
}

export function renderStory(game, ctx) {
  const payload = game.payload;
  if (!payload) return emptyState(ctx, "bunker.no_data");

  const ai = payload.ai ?? {};
  const text = ai.story || ai.summary;
  if (!text) return emptyState(ctx, "bunker.story.empty");

  const root = node("div", "bstory");
  if (ai.title) root.append(node("div", "bstory__title", ai.title));
  if (ai.teaser) root.append(node("div", "bstory__teaser", ai.teaser));

  const resolvers = mentionResolvers(game, ctx);
  const blocks = String(text).replace(/\r\n?/g, "\n").split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const body = node("div", "bstory__body md");

  blocks.forEach((block, index) => {
    const heading = /^#{1,3}\s/.test(block);
    const outro = !heading && index === blocks.length - 1 && blocks.length >= 3 && block.length <= 200 && !block.includes("\n");
    const el = node("div", heading ? "bstory__h" : outro ? "bstory__outro" : "bstory__p");
    el.innerHTML = renderDiscordMarkdownToHtml(block, resolvers);
    body.append(el);
  });

  root.append(body);
  return root;
}

function playerCard(player, ctx) {
  const mine = player.id === ctx.meId;
  const card = node("div", `bplayer bplayer--${player.status.kind}${mine ? " bplayer--me" : ""}`);
  const head = node("div", "bplayer__head");
  const badges = node("div", "bplayer__badges");

  if (mine) badges.append(chip(ctx.t("bunker.you"), "chip chip--me"));
  if (player.bot) badges.append(chip(ctx.t("bunker.bot")));

  head.append(node("div", "bplayer__name", player.name), badges);

  let statusText = ctx.t("bunker.status.unknown");
  if (player.status.kind === "finalist") statusText = ctx.t("bunker.status.finalist");
  if (player.status.kind === "eliminated") statusText = ctx.t("bunker.status.eliminated", { round: player.status.round });

  card.append(head, node("div", "bplayer__status", statusText));

  const traits = node("div", "bplayer__traits");
  for (const trait of player.traits) {
    const row = node("div", "btrait-row");
    const values = node("div", "btrait-values");

    for (const item of trait.items) {
      const value = node("span", item.round ? "btrait is-revealed" : "btrait is-hidden", traitText(item, ctx));
      if (item.round) {
        const badge = node("span", "btrait__round", ctx.t("bunker.round", { round: item.round }));
        badge.setAttribute("title", ctx.t("bunker.revealed_in_round", { round: item.round }));
        value.append(badge);
      } else {
        value.setAttribute("title", ctx.t("bunker.hidden"));
      }
      values.append(value);
    }

    row.append(node("div", "btrait-label", ctx.t(`bunker.trait.${trait.category}`)), values);
    traits.append(row);
  }

  card.append(traits);
  return card;
}

function legendItem(sampleClass, text) {
  const item = node("span", "blegend__item");
  item.append(node("span", `btrait blegend__sample ${sampleClass}`), text);
  return item;
}

export function renderPlayers(game, ctx) {
  if (!game.payload) return emptyState(ctx, "bunker.no_data");
  const players = buildPlayers(game.payload);
  if (!players.length) return emptyState(ctx, "bunker.players.empty");

  const root = node("div", "bplayers-wrap");
  const legend = node("div", "blegend");
  legend.append(
    legendItem("is-revealed", ctx.t("bunker.legend.revealed")),
    legendItem("is-hidden", ctx.t("bunker.legend.hidden"))
  );

  const grid = node("div", "bplayers");
  grid.append(...players.map((player) => playerCard(player, ctx)));

  root.append(legend, grid);
  return root;
}

function messageRow(message, round, game, ctx) {
  const humanId = SNOWFLAKE_RE.test(message.user) ? message.user : null;
  const fallback = playerName(game.payload, message.user) ?? message.user;
  const name = (humanId && ctx.entities?.peek("user", humanId)?.name) || fallback;
  const mine = message.user === ctx.meId;

  if (humanId) ctx.entities?.request("user", humanId, { guildId: guildIdOf(game) })?.catch?.(() => { });

  const row = node("div", "bmsg");
  const avatar = node("div", "bmsg__avatar");

  if (humanId) {
    const img = node("img", "bmsg__img");
    img.src = avatarFor(ctx.entities, humanId);
    img.alt = "";
    img.loading = "lazy";
    img.setAttribute("data-entity-avatar", humanId);
    avatar.append(img);
  } else {
    avatar.append(node("span", "bmsg__letter", (Array.from(name)[0] ?? "?").toUpperCase()));
  }

  const nameEl = chip(name, mine ? "chip chip--name chip--me" : "chip chip--name");
  if (humanId) {
    nameEl.setAttribute("data-entity", `user:${humanId}`);
    nameEl.setAttribute("data-prefix", "");
  }

  const head = node("div", "bmsg__head");
  head.append(nameEl);

  if (message.at != null && round.startedAt != null && message.at >= round.startedAt) {
    head.append(node("span", "bmsg__time", formatDuration(message.at - round.startedAt)));
  }

  const text = node("div", "bmsg__text md");
  text.innerHTML = renderDiscordMarkdownToHtml(message.text, mentionResolvers(game, ctx));

  const body = node("div", "bmsg__body");
  body.append(head, text);
  row.append(avatar, body);
  return row;
}

function messagesBlock(round, game, ctx) {
  const block = node("div", "bround__block");
  block.append(node("div", "bround__label", ctx.t("bunker.discussion")));

  const list = node("div", "bmsgs");
  list.append(...round.messages.slice(0, MESSAGE_LIMIT).map((message) => messageRow(message, round, game, ctx)));
  block.append(list);

  const rest = round.messages.slice(MESSAGE_LIMIT);
  if (rest.length) {
    const more = node("button", "btn bmsgs__more", ctx.t("bunker.show_more", { count: rest.length }));
    more.type = "button";
    more.addEventListener("click", () => {
      list.append(...rest.map((message) => messageRow(message, round, game, ctx)));
      more.remove();
    });
    block.append(more);
  }

  return block;
}

export function renderReplay(game, ctx) {
  if (!game.payload) return emptyState(ctx, "bunker.no_data");
  const rounds = buildRounds(game.payload);
  if (!rounds.length) return emptyState(ctx, "bunker.replay.empty");

  const root = node("div", "breplay");

  for (const round of rounds) {
    const section = node("div", "bround");
    const head = node("div", "bround__head");
    head.append(node("div", "bround__title", ctx.t("bunker.round", { round: round.number })));
    if (round.tied.length > 1) head.append(chip(ctx.t("bunker.tied", { count: round.tied.length })));

    if (round.eliminated) {
      const out = node("div", "bround__out");
      out.append(chip(ctx.t("bunker.eliminated"), "chip chip--out"), nameChip(round.eliminated, game, ctx));
      head.append(out);
    }
    section.append(head);

    if (round.reveals.length) {
      const block = node("div", "bround__block");
      block.append(node("div", "bround__label", ctx.t("bunker.reveals")));
      for (const reveal of round.reveals) {
        const row = node("div", "bround__row");
        const what = reveal.item
          ? `${ctx.t(`bunker.trait.${reveal.category}`)}: ${traitText(reveal.item, ctx)}`
          : ctx.t("bunker.unknown");
        row.append(nameChip(reveal.playerId, game, ctx), chip(what, "chip chip--trait"));
        block.append(row);
      }
      section.append(block);
    }

    if (round.messages.length) section.append(messagesBlock(round, game, ctx));

    const votes = node("div", "bround__block");
    votes.append(node("div", "bround__label", ctx.t("bunker.votes")));

    if (!round.votes.length) {
      votes.append(node("div", "bround__none", ctx.t("bunker.no_votes")));
    } else {
      const top = round.tally[0]?.count ?? 1;
      for (const entry of round.tally) {
        const row = node("div", entry.target === round.eliminated ? "bround__tally is-out" : "bround__tally");
        const bar = node("span", "bround__bar");
        bar.style.width = `${Math.round((entry.count / top) * 100)}%`;
        row.append(nameChip(entry.target, game, ctx), node("span", "bround__count", String(entry.count)), bar);
        votes.append(row);
      }

      const list = node("div", "bround__votes");
      for (const vote of round.votes) {
        const line = node("div", "bround__vote");
        line.append(nameChip(vote.from, game, ctx), node("span", "bround__arrow", "→"), nameChip(vote.to, game, ctx));
        list.append(line);
      }
      votes.append(list);
    }
    section.append(votes);
    root.append(section);
  }

  const finalists = (game.payload.finalists ?? []).map(String);
  if (finalists.length) {
    const block = node("div", "bround bround--final");
    block.append(node("div", "bround__title", ctx.t("bunker.finalists")));
    const names = node("div", "bround__finalists");
    names.append(...finalists.map((id) => nameChip(id, game, ctx)));
    block.append(names);
    root.append(block);
  }

  return root;
}

function infoRow(label, value) {
  const row = node("div", "binfo__row");
  row.append(node("div", "binfo__label", label));
  if (value instanceof Object) row.append(value);
  else row.append(node("div", "binfo__value", value));
  return row;
}

function chipList(keys, ctx) {
  const list = node("div", "binfo__chips");
  list.append(...keys.map((key) => chip(keyText(key, ctx))));
  return list;
}

function settingValue(key, value, ctx) {
  const text = String(value);
  if (key.endsWith("_duration") && text.trim() !== "" && Number.isFinite(Number(text))) return formatDuration(Number(text));
  return translated(ctx, `bunker.value.${text}`) ?? text;
}

export function renderInfo(game, ctx) {
  const payload = game.payload;
  if (!payload) return emptyState(ctx, "bunker.no_data");

  const root = node("div", "binfo");
  const section = (titleKey, rows) => {
    const rowsFiltered = rows.filter(Boolean);
    if (!rowsFiltered.length) return;
    const box = node("div", "binfo__section");
    box.append(node("div", "binfo__title", ctx.t(titleKey)), ...rowsFiltered);
    root.append(box);
  };

  const server = serverChip(game, ctx);
  const channel = channelChip(game, ctx);

  section("bunker.info.location", [
    server ? infoRow(ctx.t("bunker.info.server"), server) : null,
    channel ? infoRow(ctx.t("bunker.info.channel"), channel) : null
  ]);

  const duration = payload.started_at != null && payload.finished_at != null ? payload.finished_at - payload.started_at : null;

  section("bunker.info.overview", [
    payload.difficulty ? infoRow(ctx.t("bunker.info.difficulty"), enumText("difficulty", payload.difficulty, ctx)) : null,
    payload.end_reason ? infoRow(ctx.t("bunker.info.end_reason"), enumText("end_reason", payload.end_reason, ctx)) : null,
    duration != null ? infoRow(ctx.t("bunker.info.duration"), formatDuration(duration)) : null,
    payload.started_at != null ? infoRow(ctx.t("bunker.info.started"), formatDiscordTime(payload.started_at)) : null,
    payload.finished_at != null ? infoRow(ctx.t("bunker.info.finished"), formatDiscordTime(payload.finished_at)) : null,
    payload.lang ? infoRow(ctx.t("bunker.info.language"), String(payload.lang).toUpperCase()) : null
  ]);

  const catastrophe = payload.catastrophe;
  section("bunker.info.catastrophe", catastrophe ? [
    catastrophe.slug ? infoRow(ctx.t("bunker.info.name"), catastropheName(catastrophe, ctx)) : null,
    catastrophe.years != null ? infoRow(ctx.t("bunker.info.duration_years"), ctx.t("bunker.years", { count: catastrophe.years })) : null,
    catastrophe.description_key ? infoRow(ctx.t("bunker.info.description"), keyText(catastrophe.description_key, ctx)) : null,
    catastrophe.history_key ? infoRow(ctx.t("bunker.info.history"), keyText(catastrophe.history_key, ctx)) : null
  ] : []);

  const bunker = payload.bunker;
  section("bunker.info.bunker", bunker ? [
    bunker.description_key ? infoRow(ctx.t("bunker.info.description"), keyText(bunker.description_key, ctx)) : null,
    bunker.capacity != null ? infoRow(ctx.t("bunker.info.capacity"), String(bunker.capacity)) : null,
    bunker.rounds != null ? infoRow(ctx.t("bunker.info.rounds"), String(bunker.rounds)) : null,
    bunker.food_years != null ? infoRow(ctx.t("bunker.info.food"), ctx.t("bunker.years", { count: bunker.food_years })) : null,
    bunker.water_years != null ? infoRow(ctx.t("bunker.info.water"), ctx.t("bunker.years", { count: bunker.water_years })) : null,
    bunker.equipment_keys?.length ? infoRow(ctx.t("bunker.info.equipment"), chipList(bunker.equipment_keys, ctx)) : null,
    bunker.problem_keys?.length ? infoRow(ctx.t("bunker.info.problems"), chipList(bunker.problem_keys, ctx)) : null
  ] : []);

  section("bunker.info.settings", settingsOf(payload).map(({ key, value }) => {
    const label = translated(ctx, `bunker.setting.${key}`) ?? humanizeSlug(key);
    return infoRow(label, settingValue(key, value, ctx));
  }));

  return root.children.length ? root : emptyState(ctx, "bunker.no_data");
}

export function renderTab(tab, game, ctx) {
  if (tab === "players") return renderPlayers(game, ctx);
  if (tab === "replay") return renderReplay(game, ctx);
  if (tab === "info") return renderInfo(game, ctx);
  return renderStory(game, ctx);
}
