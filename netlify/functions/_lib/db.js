import pg from "pg";
import { env, intEnv } from "./env.js";

const { Pool } = pg;
let pool = null;

export function dbPool() {
  if (pool) return pool;

  pool = new Pool({
    connectionString: env("SUPABASE_DB_URL"),
    max: intEnv("PG_POOL_MAX", 3, 1, 10),
    idleTimeoutMillis: intEnv("PG_IDLE_TIMEOUT_MS", 10_000, 1_000, 60_000),
    connectionTimeoutMillis: intEnv("PG_CONNECT_TIMEOUT_MS", 8_000, 1_000, 30_000),
    ssl: {
      rejectUnauthorized: false
    }
  });

  return pool;
}

export async function withClient(fn) {
  const client = await dbPool().connect();

  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
