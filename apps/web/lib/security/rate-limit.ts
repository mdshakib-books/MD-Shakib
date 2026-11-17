import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type RateLimitTier =
  | "auth"
  | "payment"
  | "checkout"
  | "contact"
  | "search"
  | "webhook"
  | "admin"
  | "api";

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

export const RATE_LIMIT_TIERS: Record<RateLimitTier, RateLimitConfig> = {
  auth: { maxRequests: 5, windowSeconds: 60 },
  payment: { maxRequests: 10, windowSeconds: 60 },
  checkout: { maxRequests: 15, windowSeconds: 60 },
  contact: { maxRequests: 5, windowSeconds: 60 },
  search: { maxRequests: 60, windowSeconds: 60 },
  webhook: { maxRequests: 120, windowSeconds: 60 },
  admin: { maxRequests: 40, windowSeconds: 60 },
  api: { maxRequests: 30, windowSeconds: 60 },
};

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
  current: number;
  source: "database" | "memory";
}

// Resilient in-memory sliding window fallback store
interface MemoryRecord {
  timestamps: number[];
}
const MAX_MEMORY_ENTRIES = 10000;
const memoryStore = new Map<string, MemoryRecord>();

// Cleanup stale memory records periodically and bound memory growth
function pruneMemoryStore() {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    // Retain only timestamps from the last 15 minutes
    record.timestamps = record.timestamps.filter((ts) => now - ts < 15 * 60 * 1000);
    if (record.timestamps.length === 0) {
      memoryStore.delete(key);
    }
  }
  while (memoryStore.size > MAX_MEMORY_ENTRIES) {
    const oldestKey = memoryStore.keys().next().value;
    if (!oldestKey) break;
    memoryStore.delete(oldestKey);
  }
}

/**
 * Extracts the real client IP address from request headers safely.
 */
export function getClientIp(requestOrHeaders: Request | Headers): string {
  const headers = "headers" in requestOrHeaders ? requestOrHeaders.headers : requestOrHeaders;

  const sanitizeIpToken = (raw: string | null): string | null => {
    if (!raw) return null;
    const token = raw.trim().slice(0, 64);
    return /^[A-Za-z0-9:._-]+$/.test(token) ? token : null;
  };

  const cfConnectingIp = sanitizeIpToken(headers.get("cf-connecting-ip"));
  if (cfConnectingIp) return cfConnectingIp;

  const realIp = sanitizeIpToken(headers.get("x-real-ip"));
  if (realIp) return realIp;

  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = sanitizeIpToken(forwardedFor.split(",")[0] ?? null);
    if (firstIp) return firstIp;
  }

  return "127.0.0.1";
}

/**
 * Checks in-memory sliding window fallback.
 */
function checkMemoryRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = now - windowMs;

  if (memoryStore.size >= MAX_MEMORY_ENTRIES && !memoryStore.has(key)) {
    pruneMemoryStore();
  }

  let record = memoryStore.get(key);
  if (!record) {
    record = { timestamps: [] };
    memoryStore.set(key, record);
  }

  // Filter timestamps within current sliding window
  record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

  const current = record.timestamps.length + 1;
  const allowed = current <= maxRequests;
  const resetEpoch = Math.ceil((now + windowMs) / 1000);
  const remaining = Math.max(0, maxRequests - current);

  if (allowed) {
    record.timestamps.push(now);
  }

  // Prune periodically
  if (Math.random() < 0.05) {
    pruneMemoryStore();
  }

  return {
    allowed,
    limit: maxRequests,
    remaining,
    reset: resetEpoch,
    current,
    source: "memory",
  };
}

/**
 * Evaluates rate limit for a given key and tier.
 * Attempts distributed PostgreSQL RPC first, gracefully falling back to memory.
 */
export async function checkRateLimit(
  key: string,
  tier: RateLimitTier = "api",
  customConfig?: Partial<RateLimitConfig>
): Promise<RateLimitResult> {
  const baseConfig = RATE_LIMIT_TIERS[tier] || RATE_LIMIT_TIERS.api;
  const maxRequests = Math.max(1, Math.min(100000, Number(customConfig?.maxRequests ?? baseConfig.maxRequests) || 1));
  const windowSeconds = Math.max(1, Math.min(86400, Number(customConfig?.windowSeconds ?? baseConfig.windowSeconds) || 60));

  const sanitizedKey = (key || "anonymous").trim().slice(0, 200) || "anonymous";
  const compositeKey = `rl:${tier}:${sanitizedKey}`.slice(0, 255);

  // 1. Attempt distributed database rate limit via Supabase
  try {
    const adminDb = createAdminClient();
    const { data, error } = await adminDb.rpc("check_rate_limit", {
      p_key: compositeKey,
      p_max_requests: maxRequests,
      p_window_seconds: windowSeconds,
    });

    if (!error && data && typeof data === "object") {
      const res = data as any;
      return {
        allowed: Boolean(res.allowed),
        limit: Number(res.limit ?? maxRequests),
        remaining: Number(res.remaining ?? 0),
        reset: Number(res.reset ?? Math.ceil(Date.now() / 1000) + windowSeconds),
        current: Number(res.current ?? 1),
        source: "database",
      };
    }
  } catch {
    // Database unreachable or RPC unmigrated in current test environment; use resilient fallback
  }

  // 2. Resilient In-Memory Sliding Window Fallback
  return checkMemoryRateLimit(compositeKey, maxRequests, windowSeconds);
}

/**
 * Generates standard rate limit response headers.
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const retryAfter = Math.max(1, result.reset - Math.ceil(Date.now() / 1000));
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.reset),
    ...(result.allowed ? {} : { "Retry-After": String(retryAfter) }),
  };
}

/**
 * Returns a standard HTTP 429 Too Many Requests response with RFC-compliant headers.
 */
export function rateLimitExceededResponse(
  result: RateLimitResult,
  customMessage = "Too many requests. Please try again later."
): NextResponse {
  const retryAfter = Math.max(1, result.reset - Math.ceil(Date.now() / 1000));

  return NextResponse.json(
    {
      error: customMessage,
      limit: result.limit,
      remaining: 0,
      retryAfterSeconds: retryAfter,
    },
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        ...createRateLimitHeaders(result),
      },
    }
  );
}
