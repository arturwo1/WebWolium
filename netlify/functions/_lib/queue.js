import { BOT_KINDS } from "./validation.js";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function resultOf(row) {
  if (!row) return null;
  return row.result ?? null;
}

export function assertBotKind(kind) {
  if (!BOT_KINDS.has(kind)) {
    const err = new Error("NOT_BOT_KIND");
    err.status = 400;
    throw err;
  }
}

export async function createQueuedRequest(client, auth, kind, payload) {
  assertBotKind(kind);

  const res = await client.query(`
    insert into public.web_requests (user_id, kind, payload, status)
    values ($1::uuid, $2::text, $3::jsonb, 'pending')
    returning id
  `, [auth.authUserId, kind, JSON.stringify(payload || {})]);

  return res.rows[0]?.id;
}

export async function readQueuedRequest(client, auth, id) {
  if (!id || typeof id !== "string" || id.length > 120) {
    const err = new Error("INVALID_REQUEST_ID");
    err.status = 400;
    throw err;
  }

  const res = await client.query(`
    select id, user_id, kind, status, result, error
    from public.web_requests
    where id=$1 and user_id=$2::uuid
    limit 1
  `, [id, auth.authUserId]);

  const row = res.rows[0];

  if (!row) {
    const err = new Error("REQUEST_NOT_FOUND");
    err.status = 404;
    throw err;
  }

  return row;
}

export async function waitQueuedRequest(client, auth, id, timeoutMs = 15_000) {
  const started = Date.now();
  let delay = 500;

  while (Date.now() - started < timeoutMs) {
    const row = await readQueuedRequest(client, auth, id);

    if (row.status === "done") {
      return {
        ok: true,
        status: "done",
        id,
        result: resultOf(row)
      };
    }

    if (row.status === "error") {
      return {
        ok: true,
        status: "error",
        id,
        error: row.error || "BOT_ERROR"
      };
    }

    await sleep(delay);
    delay = Math.min(3_000, Math.floor(delay * 1.35));
  }

  return {
    ok: true,
    status: "pending",
    id,
    pollAfterMs: delay
  };
}

export async function createAndMaybeWaitQueuedRequest(client, auth, kind, payload, timeoutMs) {
  const id = await createQueuedRequest(client, auth, kind, payload);

  if (!id) {
    const err = new Error("REQUEST_CREATE_FAILED");
    err.status = 500;
    throw err;
  }

  return await waitQueuedRequest(client, auth, id, timeoutMs);
}
