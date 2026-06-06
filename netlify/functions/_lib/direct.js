import {
  cleanText,
  DELETE_ACTIONS,
  durationRangeSeconds,
  METRICS,
  safeBigIntString,
  seriesParams
} from "./validation.js";

function parseJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;

  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
}

function toNum(value) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (value == null) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

function rowJson(row) {
  if (!row || typeof row !== "object") return row;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, toNum(value)]));
}

function guildChannelMeta(guildId, channelId) {
  if (!guildId) {
    return {
      guild_name: "DM",
      channel_name: ""
    };
  }

  return {
    guild_name: `Server ${guildId}`,
    channel_name: channelId ? `channel ${channelId}` : "channel"
  };
}

async function privacyFlags(client) {
  const envFlags = String(process.env.PRIVACY_FLAGS || "")
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);

  if (envFlags.length) return envFlags;

  const res = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema='public'
      and table_name='user_privacy'
      and data_type='boolean'
      and column_name <> 'user_id'
    order by ordinal_position
  `);

  return res.rows
    .map(r => r.column_name)
    .filter(name => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name));
}

function qIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error("INVALID_COLUMN_NAME");
  }

  return `"${name.replaceAll('"', '""')}"`;
}

export async function handlePublicStats(client) {
  const res = await client.query("select key, value from public_stats");
  const result = {};

  for (const row of res.rows) {
    result[row.key] = row.value;
  }

  return result;
}

export async function handleUserPrivacy(client, auth) {
  const flags = await privacyFlags(client);

  if (!flags.length) return {};

  const cols = flags.map(qIdent).join(", ");
  const res = await client.query(
    `select ${cols} from user_privacy where user_id=$1::bigint limit 1`,
    [auth.discordId]
  );

  if (res.rows[0]) return res.rows[0];

  const inserted = await client.query(
    `insert into user_privacy (user_id) values ($1::bigint) on conflict (user_id) do nothing returning ${cols}`,
    [auth.discordId]
  );

  if (inserted.rows[0]) return inserted.rows[0];

  const reread = await client.query(
    `select ${cols} from user_privacy where user_id=$1::bigint limit 1`,
    [auth.discordId]
  );

  return reread.rows[0] || {};
}

export async function handleSetPrivacy(client, auth, payload) {
  const flags = new Set(await privacyFlags(client));
  const filtered = Object.fromEntries(
    Object.entries(payload || {})
      .filter(([key]) => flags.has(key))
      .map(([key, value]) => [key, Boolean(value)])
  );

  if (!Object.keys(filtered).length) {
    const err = new Error("NO_VALID_FLAGS");
    err.status = 400;
    throw err;
  }

  const keys = Object.keys(filtered);
  const insertCols = ["user_id", ...keys].map(qIdent).join(", ");
  const insertArgs = [auth.discordId, ...keys.map(key => filtered[key])];
  const insertPlaceholders = insertArgs.map((_, i) => `$${i + 1}`).join(", ");
  const updateExpr = keys.map(key => `${qIdent(key)}=excluded.${qIdent(key)}`).join(", ");
  const returnCols = [...flags].map(qIdent).join(", ");

  const res = await client.query(
    `insert into user_privacy (${insertCols})
     values (${insertPlaceholders})
     on conflict (user_id) do update set ${updateExpr}
     returning ${returnCols}`,
    insertArgs
  );

  return res.rows[0] || {};
}

export async function handleDeleteUserData(client, auth, payload) {
  const action = String(payload.action || "");

  if (!DELETE_ACTIONS.has(action)) {
    const err = new Error("UNKNOWN_DELETE_ACTION");
    err.status = 400;
    throw err;
  }

  await client.query("begin");

  try {
    if (action === "messages") {
      await client.query("delete from messages where user_id=$1::bigint", [auth.discordId]);
    } else if (action === "voice") {
      await client.query("delete from voice where user_id=$1::bigint", [auth.discordId]);
    } else if (action === "activities") {
      await client.query("delete from activity_segments where user_id=$1::bigint", [auth.discordId]);
      await client.query("delete from presence_snapshots where user_id=$1::bigint", [auth.discordId]);
    } else if (action === "economy") {
      await client.query("delete from inventory where user_id=$1::bigint", [auth.discordId]);
      await client.query("delete from equipment where user_id=$1::bigint", [auth.discordId]);
      await client.query("delete from user_data where user_id=$1::bigint", [auth.discordId]);
    } else if (action === "analytics") {
      await client.query("delete from user_commands where user_id=$1::bigint", [auth.discordId]);
      await client.query("delete from topgg where user_id=$1::bigint", [auth.discordId]);
    }

    await client.query("commit");
    return { ok: true };
  } catch (e) {
    await client.query("rollback");
    throw e;
  }
}

export async function handleDeleteAllUserData(client, auth) {
  await client.query("delete from users where user_id=$1::bigint", [auth.discordId]);
  return { ok: true };
}

export async function handleMessagesSeries(client, auth, payload) {
  const p = seriesParams(payload);
  const res = await client.query(`
    with base as (
      select
        (extract(epoch from date_time) * 1000)::bigint as ts_ms,
        content,
        guild_id,
        channel_id,
        message_url,
        attachments
      from messages
      where user_id=$1::bigint
        and date_time >= to_timestamp($2::bigint / 1000.0)
        and date_time <= to_timestamp($3::bigint / 1000.0)
        and ($6::bigint is null or guild_id=$6::bigint)
        and ($7::bigint is null or channel_id=$7::bigint)
        and ($8::text is null or content ilike ('%' || $8::text || '%'))
    ),
    buck as (
      select
        ((ts_ms / $4::bigint) * $4::bigint) as bucket_start,
        count(*)::bigint as y,
        min(ts_ms) as min_ts
      from base
      group by 1
    ),
    sample as (
      select distinct on (((ts_ms / $4::bigint) * $4::bigint))
        ((ts_ms / $4::bigint) * $4::bigint) as bucket_start,
        ts_ms as sample_ts,
        content as sample_content,
        guild_id as sample_guild_id,
        channel_id as sample_channel_id,
        message_url as sample_url,
        attachments as sample_attachments
      from base
      order by ((ts_ms / $4::bigint) * $4::bigint), ts_ms asc
    )
    select
      (case when b.y=1 then b.min_ts else (b.bucket_start + ($4::bigint / 2)) end)::bigint as ts,
      b.y::bigint as y,
      b.bucket_start::bigint as bucket_start,
      (b.bucket_start + $4::bigint)::bigint as bucket_end,
      s.sample_ts::bigint as sample_ts,
      s.sample_content,
      s.sample_url,
      s.sample_guild_id,
      s.sample_channel_id,
      s.sample_attachments
    from buck b
    left join sample s using (bucket_start)
    order by b.bucket_start asc
    limit $5
  `, [auth.discordId, p.fromMs, p.toMs, p.bucketMs, p.limit, p.guildId, p.channelId, p.context]);

  return res.rows.map(row => {
    const d = rowJson(row);
    const meta = guildChannelMeta(d.sample_guild_id, d.sample_channel_id);
    d.meta = {
      url: d.sample_url || null,
      guild_name: meta.guild_name,
      channel_name: meta.channel_name
    };
    return d;
  });
}

export async function handleVoiceSeries(client, auth, payload) {
  const p = seriesParams(payload);
  const dur = durationRangeSeconds(payload);
  const guildName = cleanText(payload.guild_name);
  const channelName = cleanText(payload.channel_name);

  const res = await client.query(`
    select
      (extract(epoch from enter_time) * 1000)::bigint as ts_ms,
      greatest(0, extract(epoch from (leave_time - enter_time)))::bigint as seconds,
      guild_id,
      after_channel_id as channel_id
    from voice
    where user_id=$1::bigint
      and enter_time >= to_timestamp($2::bigint / 1000.0)
      and enter_time <= to_timestamp($3::bigint / 1000.0)
      and ($4::bigint is null or guild_id=$4::bigint)
      and ($5::bigint is null or after_channel_id=$5::bigint)
      and ($6::bigint is null or greatest(0, extract(epoch from (leave_time - enter_time)))::bigint >= $6::bigint)
      and ($7::bigint is null or greatest(0, extract(epoch from (leave_time - enter_time)))::bigint <= $7::bigint)
    order by enter_time asc
  `, [auth.discordId, p.fromMs, p.toMs, p.guildId, p.channelId, dur.minSec, dur.maxSec]);

  const buckets = new Map();

  for (const row of res.rows) {
    const d = rowJson(row);
    const meta = guildChannelMeta(d.guild_id, d.channel_id);

    if (guildName && !meta.guild_name.toLowerCase().includes(guildName.toLowerCase())) continue;
    if (channelName && !meta.channel_name.toLowerCase().includes(channelName.toLowerCase())) continue;

    const tsMs = Number(d.ts_ms || 0);
    const seconds = Number(d.seconds || 0);
    const bucketStart = Math.floor(tsMs / p.bucketMs) * p.bucketMs;

    const item = buckets.get(bucketStart);

    if (!item) {
      buckets.set(bucketStart, {
        ts: bucketStart + Math.floor(p.bucketMs / 2),
        y: seconds,
        bucket_start: bucketStart,
        bucket_end: bucketStart + p.bucketMs,
        meta: {
          guild_id: d.guild_id,
          channel_id: d.channel_id,
          guild_name: meta.guild_name,
          channel_name: meta.channel_name
        }
      });
    } else {
      item.y += seconds;
    }
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, p.limit)
    .map(([, value]) => value);
}

function presenceStatus(statusCode, payloadRaw) {
  const payload = parseJson(payloadRaw);

  for (const key of ["status", "overall_status", "user_status"]) {
    if (payload[key] != null && payload[key] !== "") {
      return String(payload[key]).trim().toLowerCase();
    }
  }

  if (statusCode != null && statusCode !== "") return String(statusCode).trim().toLowerCase();
  return null;
}

export async function handleActivitiesSeries(client, auth, payload) {
  const p = seriesParams(payload);
  const dur = durationRangeSeconds(payload);
  const activityName = cleanText(payload.activity_name || p.context);
  const track = cleanText(payload.track);
  const album = cleanText(payload.album);
  const artist = cleanText(payload.artist);
  const status = cleanText(payload.status, 32);

  const res = await client.query(`
    with raw_acts as (
      select
        s.id::bigint as id,
        s.def_id::bigint as def_id,
        s.snapshot_id::bigint as snapshot_id,
        (extract(epoch from s.started_at) * 1000)::bigint as act_start_ms,
        (extract(epoch from least(coalesce(s.ended_at, CURRENT_TIMESTAMP), to_timestamp($3::bigint / 1000.0))) * 1000)::bigint as act_end_ms
      from activity_segments s
      where s.user_id=$1::bigint
        and coalesce(s.ended_at, s.started_at) >= to_timestamp($2::bigint / 1000.0)
        and s.started_at <= to_timestamp($3::bigint / 1000.0)
    ),
    acts as (
      select
        a.*,
        d.source_kind,
        d.activity_type,
        d.name,
        d.payload as activity_def_payload,
        ps.status_code,
        ps.payload as presence_payload,
        ps.fingerprint,
        ps.guild_id,
        ps.user_id as ps_user_id,
        ps.desktop_status_code,
        ps.mobile_status_code,
        ps.web_status_code
      from raw_acts a
      join activity_defs d on d.id=a.def_id
      left join presence_snapshots ps on ps.id=a.snapshot_id
    ),
    filtered_acts as (
      select * from acts a
      where ($4::text is null or a.name ilike ('%' || $4::text || '%'))
        and ($5::text is null or coalesce(a.activity_def_payload->>'track', a.activity_def_payload->>'song', '') ilike ('%' || $5::text || '%'))
        and ($6::text is null or coalesce(a.activity_def_payload->>'album', '') ilike ('%' || $6::text || '%'))
        and ($7::text is null or coalesce(a.activity_def_payload->>'artist', '') ilike ('%' || $7::text || '%'))
        and ($8::bigint is null or (a.act_end_ms - a.act_start_ms)/1000 >= $8::bigint)
        and ($9::bigint is null or (a.act_end_ms - a.act_start_ms)/1000 <= $9::bigint)
        and ($10::text is null or $10::text = '' or a.status_code = case lower($10::text) when 'offline' then 0 when 'online' then 1 when 'idle' then 2 when 'dnd' then 3 when 'invisible' then 4 end::smallint)
    ),
    bucketed_acts as (
      select ((f.act_start_ms / $11::bigint) * $11::bigint) as bucket_start, f.*
      from filtered_acts f
    ),
    buck as (
      select
        bucket_start,
        (bucket_start + $11::bigint) as bucket_end,
        count(*)::bigint as total_count,
        sum((least(act_end_ms, bucket_start + $11::bigint) - greatest(act_start_ms, bucket_start)))/1000 as total_duration,
        min(act_start_ms) as min_ts
      from bucketed_acts
      group by 1
    ),
    sample as (
      select distinct on (bucket_start)
        bucket_start,
        id as sample_id,
        def_id as sample_def_id,
        snapshot_id as sample_snapshot_id,
        act_start_ms as sample_act_start_ms,
        act_end_ms as sample_act_end_ms,
        source_kind as sample_source_kind,
        activity_type as sample_activity_type,
        name as sample_name,
        activity_def_payload as sample_activity_def_payload,
        status_code as sample_status_code,
        presence_payload as sample_presence_payload,
        fingerprint as sample_fingerprint,
        guild_id as sample_guild_id,
        ps_user_id as sample_ps_user_id,
        desktop_status_code as sample_desktop_status_code,
        mobile_status_code as sample_mobile_status_code,
        web_status_code as sample_web_status_code
      from bucketed_acts
      order by bucket_start, (act_end_ms - act_start_ms) desc
    )
    select
      (case when b.total_count=1 then b.min_ts else (b.bucket_start + ($11::bigint / 2)) end)::bigint as ts,
      b.total_count::bigint as y_count,
      b.total_duration::bigint as y_duration,
      b.bucket_start::bigint as bucket_start,
      b.bucket_end::bigint as bucket_end,
      s.sample_id as id,
      s.sample_def_id as def_id,
      s.sample_act_start_ms as started_at_ms,
      s.sample_act_end_ms as ended_at_ms,
      ((s.sample_act_end_ms - s.sample_act_start_ms)/1000)::bigint as duration_seconds,
      s.sample_source_kind as source_kind,
      s.sample_activity_type as activity_type,
      s.sample_name as name,
      s.sample_activity_def_payload as activity_def_payload,
      s.sample_snapshot_id as presence_snapshot_id,
      s.sample_fingerprint as presence_snapshot_fingerprint,
      s.sample_guild_id as presence_snapshot_guild_id,
      s.sample_ps_user_id as presence_snapshot_user_id,
      s.sample_status_code as status_code,
      s.sample_desktop_status_code as desktop_status_code,
      s.sample_mobile_status_code as mobile_status_code,
      s.sample_web_status_code as web_status_code,
      s.sample_presence_payload as presence_snapshot_payload
    from buck b
    left join sample s using (bucket_start)
    order by b.bucket_start asc
    limit $12
  `, [auth.discordId, p.fromMs, p.toMs, activityName, track, album, artist, dur.minSec, dur.maxSec, status, p.bucketMs, p.limit]);

  return res.rows.map(row => {
    const d = rowJson(row);
    const activityPayload = parseJson(d.activity_def_payload);

    return {
      ts: Number(d.ts),
      y: Number(d.y_duration),
      count: Number(d.y_count),
      bucket_start: Number(d.bucket_start),
      bucket_end: Number(d.bucket_end),
      meta: {
        id: Number(d.id),
        name: d.name,
        status: presenceStatus(d.status_code, d.presence_snapshot_payload),
        duration_seconds: Number(d.duration_seconds),
        total_bucket_duration: Number(d.y_duration),
        total_bucket_count: Number(d.y_count),
        track: activityPayload.track || activityPayload.song,
        album: activityPayload.album,
        artist: activityPayload.artist,
        activity_def: {
          name: d.name,
          source_kind: d.source_kind,
          activity_type: d.activity_type,
          payload: activityPayload
        },
        presence_snapshot: {
          id: d.presence_snapshot_id,
          fingerprint: d.presence_snapshot_fingerprint,
          guild_id: d.presence_snapshot_guild_id,
          user_id: d.presence_snapshot_user_id,
          status_code: d.status_code,
          desktop_status_code: d.desktop_status_code,
          mobile_status_code: d.mobile_status_code,
          web_status_code: d.web_status_code,
          payload: parseJson(d.presence_snapshot_payload)
        }
      }
    };
  });
}

export async function handleCommandsSeries(client, auth, payload) {
  const p = seriesParams(payload);

  const res = await client.query(`
    with base as (
      select
        (extract(epoch from uc.timestamp) * 1000)::bigint as ts_ms,
        uc.guild_id,
        uc.channel_id,
        c.name as command_name,
        uc.args
      from user_commands uc
      left join commands c on c.id=uc.command_id
      where uc.user_id=$1::bigint
        and uc.timestamp >= to_timestamp($2::bigint / 1000.0)
        and uc.timestamp <= to_timestamp($3::bigint / 1000.0)
        and ($6::bigint is null or uc.guild_id=$6::bigint)
        and ($7::bigint is null or uc.channel_id=$7::bigint)
        and ($8::text is null or (
          c.name ilike ($8::text || '%')
          or c.name ilike ('%' || $8::text || '%')
          or (length($8::text) >= 3 and similarity(c.name, $8::text) > 0.3)
        ))
    ),
    buck as (
      select
        ((ts_ms / $4::bigint) * $4::bigint) as bucket_start,
        count(*)::bigint as y,
        min(ts_ms) as min_ts
      from base
      group by 1
    ),
    sample as (
      select distinct on (((ts_ms / $4::bigint) * $4::bigint))
        ((ts_ms / $4::bigint) * $4::bigint) as bucket_start,
        ts_ms as sample_ts,
        command_name as sample_command_name,
        args as sample_args,
        guild_id as sample_guild_id,
        channel_id as sample_channel_id
      from base
      order by ((ts_ms / $4::bigint) * $4::bigint), ts_ms asc
    )
    select
      (case when b.y=1 then b.min_ts else (b.bucket_start + ($4::bigint / 2)) end)::bigint as ts,
      b.y::bigint as y,
      b.bucket_start::bigint as bucket_start,
      (b.bucket_start + $4::bigint)::bigint as bucket_end,
      s.sample_ts::bigint as sample_ts,
      s.sample_command_name,
      s.sample_args,
      s.sample_guild_id,
      s.sample_channel_id
    from buck b
    left join sample s using (bucket_start)
    order by b.bucket_start asc
    limit $5
  `, [auth.discordId, p.fromMs, p.toMs, p.bucketMs, p.limit, p.guildId, p.channelId, p.context]);

  return res.rows.map(row => {
    const d = rowJson(row);
    const meta = guildChannelMeta(d.sample_guild_id, d.sample_channel_id);
    d.meta = {
      guild_name: meta.guild_name,
      channel_name: meta.channel_name
    };
    return d;
  });
}

export async function handleDirectKind(client, auth, kind, payload) {
  if (kind === "public_stats") return await handlePublicStats(client);
  if (kind === "user_privacy") return await handleUserPrivacy(client, auth);
  if (kind === "set_privacy") return await handleSetPrivacy(client, auth, payload);
  if (kind === "delete_user_data") return await handleDeleteUserData(client, auth, payload);
  if (kind === "delete_all_user_data") return await handleDeleteAllUserData(client, auth);
  if (kind === "messages_series") return await handleMessagesSeries(client, auth, payload);
  if (kind === "voice_series") return await handleVoiceSeries(client, auth, payload);
  if (kind === "activities_series") return await handleActivitiesSeries(client, auth, payload);
  if (kind === "commands_series") return await handleCommandsSeries(client, auth, payload);

  const err = new Error("NOT_DIRECT_KIND");
  err.status = 400;
  throw err;
}

export function assertLeaderboardPayload(payload) {
  const metric = String(payload.metric || "total_balance");
  const scope = String(payload.scope || "world");

  if (!METRICS.has(metric)) {
    const err = new Error("UNKNOWN_METRIC");
    err.status = 400;
    throw err;
  }

  if (!["world", "server", "top_servers"].includes(scope)) {
    const err = new Error("UNKNOWN_SCOPE");
    err.status = 400;
    throw err;
  }

  if (scope === "server" && !safeBigIntString(payload.guild_id)) {
    const err = new Error("GUILD_ID_REQUIRED");
    err.status = 400;
    throw err;
  }
}
