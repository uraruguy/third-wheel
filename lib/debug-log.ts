export type DebugEvent = {
  ts: string;
  event: string;
  sessionId?: string;
  [key: string]: unknown;
};

const MAX_EVENTS = 500;
const REDIS_KEY = "third-wheel:debug:events";
const ring: DebugEvent[] = [];

const REDACT_KEYS = /api[_-]?key|authorization|secret|password|token/i;

export function debugLog(
  event: string,
  fields: Record<string, unknown> = {},
): DebugEvent {
  const entry: DebugEvent = {
    ts: new Date().toISOString(),
    event,
    ...sanitize(fields),
  };
  ring.push(entry);
  if (ring.length > MAX_EVENTS) ring.shift();
  console.log(JSON.stringify(entry));
  void persistToRedis(entry);
  return entry;
}

export async function getDebugEvents(): Promise<DebugEvent[]> {
  const remote = await loadFromRedis();
  if (remote && remote.length > 0) return remote;
  return [...ring];
}

export function isDebugAuthorized(
  request: Request,
  env: { NODE_ENV?: string; DEBUG_LOG_SECRET?: string } = process.env,
): boolean {
  const secret = env.DEBUG_LOG_SECRET?.trim();
  const provided =
    bearerToken(request) ||
    new URL(request.url).searchParams.get("secret") ||
    "";
  if (secret) return provided === secret;
  return env.NODE_ENV !== "production";
}

function redisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function persistToRedis(entry: DebugEvent) {
  const redis = redisConfig();
  if (!redis) return;
  try {
    await fetch(`${redis.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redis.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["LPUSH", REDIS_KEY, JSON.stringify(entry)],
        ["LTRIM", REDIS_KEY, 0, MAX_EVENTS - 1],
      ]),
    });
  } catch {
    // Memory ring and console.log already hold a copy.
  }
}

async function loadFromRedis(): Promise<DebugEvent[] | null> {
  const redis = redisConfig();
  if (!redis) return null;
  try {
    const key = encodeURIComponent(REDIS_KEY);
    const response = await fetch(
      `${redis.url}/lrange/${key}/0/${MAX_EVENTS - 1}`,
      { headers: { Authorization: `Bearer ${redis.token}` } },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as unknown;
    const rows = redisStringList(payload);
    return rows.flatMap((row) => {
      try {
        return [JSON.parse(row) as DebugEvent];
      } catch {
        return [];
      }
    });
  } catch {
    return null;
  }
}

function redisStringList(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is string => typeof row === "string");
  }
  if (payload && typeof payload === "object" && "result" in payload) {
    const result = (payload as { result?: unknown }).result;
    if (Array.isArray(result)) {
      return result.filter((row): row is string => typeof row === "string");
    }
  }
  return [];
}

function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function sanitize(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (REDACT_KEYS.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = value;
  }
  return out;
}
