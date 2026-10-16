export function createUserFetcher(queue, { concurrency = 3 } = {}) {
  return async (ids) => {
    const out = {};

    for (let i = 0; i < ids.length; i += concurrency) {
      await Promise.all(ids.slice(i, i + concurrency).map(async (id) => {
        try {
          const res = await queue("user_profile_stats", { user_id: id }, { cacheTtlMs: 300_000, cooldownMs: 0, timeoutMs: 8_000 });
          if (!res || res.error) return;
          out[id] = { name: res.display_name || res.user_name || "", avatar: res.user_avatar ?? null };
        } catch { }
      }));
    }

    return out;
  };
}
