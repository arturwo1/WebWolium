import { withClient } from "./_lib/db.js";
import { requireAuth, requireLinkedUser } from "./_lib/auth.js";
import { cleanupLimits, rateLimit } from "./_lib/limits.js";
import { errorJson, json, method, readJson, clientIp, publicHeaders } from "./_lib/http.js";
import { handleDirectKind, assertLeaderboardPayload } from "./_lib/direct.js";
import { createAndMaybeWaitQueuedRequest, readQueuedRequest } from "./_lib/queue.js";
import { assertKnownKind, assertPayloadSize, BOT_KINDS, DIRECT_KINDS, normalizePayload } from "./_lib/validation.js";
import { intEnv } from "./_lib/env.js";

async function handleStatus(client, req, body) {
  const auth = await requireAuth(req, client);
  await requireLinkedUser(client, auth);

  rateLimit(`status:${auth.authUserId}`, {
    windowMs: 10_000,
    limit: 60
  });

  const row = await readQueuedRequest(client, auth, String(body.id || ""));

  if (row.status === "done") {
    return json({
      ok: true,
      status: "done",
      id: row.id,
      result: row.result ?? null
    });
  }

  if (row.status === "error") {
    return json({
      ok: true,
      status: "error",
      id: row.id,
      error: row.error || "BOT_ERROR"
    });
  }

  return json({
    ok: true,
    status: row.status || "pending",
    id: row.id,
    pollAfterMs: 900
  });
}

async function handleRequest(client, req, body) {
  const kind = String(body.kind || "");
  const payload = normalizePayload(body.payload);
  const maxPayloadBytes = intEnv("API_MAX_PAYLOAD_BYTES", 64 * 1024, 1024, 512 * 1024);

  assertKnownKind(kind);
  assertPayloadSize(payload, maxPayloadBytes);

  if (kind === "public_stats") {
    rateLimit(`public:${clientIp(req)}:${kind}`, {
      windowMs: 10_000,
      limit: 40
    });

    const result = await handleDirectKind(client, null, kind, payload);

    return json({
      ok: true,
      status: "done",
      result
    }, 200, publicHeaders(30));
  }

  const auth = await requireAuth(req, client);
  await requireLinkedUser(client, auth);

  rateLimit(`user:${auth.authUserId}:${kind}`, {
    windowMs: 10_000,
    limit: kind.endsWith("_series") ? 20 : 30
  });

  if (kind === "leaderboard") {
    assertLeaderboardPayload(payload);
  }

  if (DIRECT_KINDS.has(kind)) {
    const result = await handleDirectKind(client, auth, kind, payload);

    return json({
      ok: true,
      status: "done",
      result
    });
  }

  if (BOT_KINDS.has(kind)) {
    const timeoutMs = Math.min(
      intEnv("API_BOT_WAIT_MAX_MS", 20_000, 1_000, 55_000),
      Math.max(1_000, Number(body.timeoutMs || 15_000) || 15_000)
    );

    const data = await createAndMaybeWaitQueuedRequest(client, auth, kind, payload, timeoutMs);
    return json(data);
  }

  return errorJson("UNKNOWN_KIND", 400);
}

export default async (req) => {
  try {
    cleanupLimits();
    method(req, ["POST"]);

    const body = await readJson(req, intEnv("API_MAX_BODY_BYTES", 80 * 1024, 1024, 1024 * 1024));
    const mode = String(body.mode || "request");

    return await withClient(async (client) => {
      if (mode === "status") return await handleStatus(client, req, body);
      return await handleRequest(client, req, body);
    });
  } catch (e) {
    const status = e?.status || 500;

    return errorJson(e?.message || "INTERNAL_ERROR", status, {
      retryAfterMs: e?.retryAfterMs ?? null
    });
  }
};
