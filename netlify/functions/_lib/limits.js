const buckets = new Map();

export function rateLimit(key, {
  windowMs = 10_000,
  limit = 30
} = {}) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + windowMs
    });
    return;
  }

  bucket.count += 1;

  if (bucket.count > limit) {
    const err = new Error("RATE_LIMITED");
    err.status = 429;
    err.retryAfterMs = bucket.resetAt - now;
    throw err;
  }
}

export function cleanupLimits() {
  const now = Date.now();

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
