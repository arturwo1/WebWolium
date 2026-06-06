export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

export function errorJson(error, status = 400, extra = {}) {
  const code = String(extra.code || error || "ERROR");

  return json({
    ok: false,
    error: String(error || "ERROR"),
    code,
    ...extra
  }, status);
}

export async function readJson(req, maxBytes = 64 * 1024) {
  const text = await req.text();

  if (new TextEncoder().encode(text).length > maxBytes) {
    const err = new Error("BODY_TOO_LARGE");
    err.status = 413;
    throw err;
  }

  if (!text.trim()) return {};

  try {
    return JSON.parse(text);
  } catch {
    const err = new Error("INVALID_JSON");
    err.status = 400;
    throw err;
  }
}

export function method(req, allowed) {
  if (!allowed.includes(req.method)) {
    const err = new Error("METHOD_NOT_ALLOWED");
    err.status = 405;
    throw err;
  }
}

export function clientIp(req) {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  const first = forwarded.split(",")[0]?.trim();
  return first || req.headers.get("x-nf-client-connection-ip") || "unknown";
}

export function publicHeaders(maxAgeSeconds = 30) {
  return {
    "Cache-Control": `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds}`
  };
}
