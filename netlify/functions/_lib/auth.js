import { supabaseAdmin } from "./supabase.js";

export function bearer(req) {
  const auth = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m ? m[1] : null;
}

export async function requireAuth(req, client) {
  const token = bearer(req);

  if (!token) {
    const err = new Error("NOT_LOGGED_IN");
    err.status = 401;
    throw err;
  }

  const { data, error } = await supabaseAdmin().auth.getUser(token);

  if (error || !data?.user?.id) {
    const err = new Error("INVALID_SESSION");
    err.status = 401;
    throw err;
  }

  const user = data.user;
  const authUserId = user.id;

  let discordId = user.user_metadata?.sub || user.raw_user_meta_data?.sub || null;

  if (!discordId && client) {
    const row = await client.query(
      "select raw_user_meta_data->>'sub' as discord_id from auth.users where id=$1 limit 1",
      [authUserId]
    );
    discordId = row.rows[0]?.discord_id || null;
  }

  if (!discordId || !String(discordId).match(/^\d+$/)) {
    const err = new Error("DISCORD_ID_NOT_FOUND");
    err.status = 403;
    throw err;
  }

  return {
    authUserId,
    discordId: String(discordId),
    token,
    user
  };
}

export async function requireLinkedUser(client, auth) {
  const row = await client.query(
    "select user_id, banned, auth_user_id, badges from users where user_id=$1::bigint limit 1",
    [auth.discordId]
  );

  const user = row.rows[0] || null;

  if (!user) {
    const err = new Error("USER_NOT_FOUND");
    err.status = 403;
    throw err;
  }

  if (user.banned) {
    const err = new Error("USER_BANNED");
    err.status = 403;
    throw err;
  }

  if (!user.auth_user_id) {
    await client.query(
      "update users set auth_user_id=$2 where user_id=$1::bigint and auth_user_id is null",
      [auth.discordId, auth.authUserId]
    );
  } else if (String(user.auth_user_id) !== String(auth.authUserId)) {
    const err = new Error("ACCOUNT_ALREADY_LINKED");
    err.status = 403;
    throw err;
  }

  return user;
}
