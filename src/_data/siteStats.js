const API_URL = "https://wolium.netlify.app/.netlify/functions/api";
const REQUEST_TIMEOUT_MS = 8_000;

async function fetchPublicStats() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "public_stats", payload: {} }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok || data.status !== "done") return null;
    return data.result ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default async function () {
  const result = await fetchPublicStats();
  const currentYear = new Date().getFullYear();

  return {
    users: result?.users ?? null,
    servers: result?.servers ?? null,
    years: `2023-${currentYear}`,
  };
}