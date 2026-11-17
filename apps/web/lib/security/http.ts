import crypto from "crypto";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const AWB_REGEX = /^[A-Za-z0-9_-]{4,40}$/;

export const DEFAULT_MAX_JSON_BODY_BYTES = 128 * 1024; // 128 KB
export const DEFAULT_MAX_WEBHOOK_BODY_BYTES = 512 * 1024; // 512 KB

export const NO_STORE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  "X-Content-Type-Options": "nosniff",
};

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value.trim());
}

export function isValidAwb(value: unknown): value is string {
  return typeof value === "string" && AWB_REGEX.test(value.trim());
}

/**
 * Extracts or mints a safe request correlation ID for log tracing.
 */
export function getCorrelationId(req?: Request | Headers): string {
  try {
    const headers = req
      ? "headers" in req
        ? req.headers
        : req
      : undefined;
    const raw = headers?.get("x-request-id") || headers?.get("x-correlation-id");
    if (raw && /^[A-Za-z0-9_.-]{6,64}$/.test(raw.trim())) {
      return raw.trim();
    }
  } catch {
    // ignore
  }
  return crypto.randomUUID();
}

/**
 * Reads a request body as UTF-8 text while enforcing a maximum byte limit.
 */
export async function readBoundedTextBody(
  req: Request,
  maxBytes: number = DEFAULT_MAX_JSON_BODY_BYTES
): Promise<
  | { ok: true; text: string }
  | { ok: false; status: 400 | 413; error: string }
> {
  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader) {
    const declared = Number(contentLengthHeader);
    if (Number.isFinite(declared) && declared > maxBytes) {
      return {
        ok: false,
        status: 413,
        error: `Request payload too large (maximum ${maxBytes} bytes).`,
      };
    }
  }

  let text: string;
  try {
    text = await req.text();
  } catch {
    return {
      ok: false,
      status: 400,
      error: "Failed to read request body.",
    };
  }

  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `Request payload too large (maximum ${maxBytes} bytes).`,
    };
  }

  return { ok: true, text };
}

/**
 * Parses a bounded JSON object body safely.
 */
export async function readBoundedJsonBody<T = Record<string, any>>(
  req: Request,
  maxBytes: number = DEFAULT_MAX_JSON_BODY_BYTES
): Promise<
  | { ok: true; data: T }
  | { ok: false; status: 400 | 413; error: string }
> {
  const body = await readBoundedTextBody(req, maxBytes);
  if (!body.ok) {
    return body;
  }

  try {
    const parsed = JSON.parse(body.text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false,
        status: 400,
        error: "Request body must be a JSON object.",
      };
    }
    return { ok: true, data: parsed as T };
  } catch {
    return {
      ok: false,
      status: 400,
      error: "Malformed JSON request payload.",
    };
  }
}

const INTERNAL_LEAK_PATTERNS = [
  /postgres|pg_|pgrst|sqlstate|relation "|column "|duplicate key|violates|syntax error at or near/i,
  /eyJ[a-zA-Z0-9_-]{10,}/,
  /stack|node_modules|at\s+[A-Za-z0-9_$.]+\s*\(/i,
  /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed/i,
];

/**
 * Redacts accidental database/internal error details while preserving clean user-facing domain messages.
 */
export function sanitizeClientErrorMessage(
  err: unknown,
  fallbackMessage: string
): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 260) {
    return fallbackMessage;
  }
  if (INTERNAL_LEAK_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return fallbackMessage;
  }
  return trimmed;
}

/**
 * Logs unexpected API route exceptions with correlation context and returns a safe JSON 500 response.
 */
export function serverErrorResponse(
  endpoint: string,
  err: unknown,
  fallbackMessage = "Internal server error",
  req?: Request | Headers
): NextResponse {
  const correlationId = getCorrelationId(req);
  logger.error(`Unhandled API error at ${endpoint}`, { endpoint, correlationId }, err);
  return NextResponse.json(
    {
      error: fallbackMessage,
      correlationId,
    },
    {
      status: 500,
      headers: {
        ...NO_STORE_HEADERS,
        "x-request-id": correlationId,
      },
    }
  );
}

/**
 * Executes an async operation with a hard deadline to protect routes from stalled upstreams.
 */
export async function withHardTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage = "Upstream operation timed out."
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  try {
    return await Promise.race([operation(), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Validates customer-submitted attachment URLs (support tickets, return evidence).
 * Only permits safe https:// URLs (no javascript:, data:, file:, or loopback hosts).
 */
export function sanitizeAttachmentUrls(
  urls: unknown,
  maxItems = 5
): { valid: boolean; urls: string[]; error?: string } {
  if (urls === undefined || urls === null) {
    return { valid: true, urls: [] };
  }
  if (!Array.isArray(urls)) {
    return { valid: false, urls: [], error: "Attachments must be an array of URLs." };
  }
  if (urls.length > maxItems) {
    return {
      valid: false,
      urls: [],
      error: `A maximum of ${maxItems} attachments is allowed.`,
    };
  }

  const cleaned: string[] = [];
  for (const item of urls) {
    if (typeof item !== "string") {
      return { valid: false, urls: [], error: "Attachment entries must be valid HTTPS URL strings." };
    }
    const candidate = item.trim();
    if (!candidate) continue;
    if (candidate.length > 500) {
      return { valid: false, urls: [], error: "Attachment URL is too long." };
    }
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      return { valid: false, urls: [], error: "Attachment must be a valid URL." };
    }
    if (parsed.protocol !== "https:") {
      return {
        valid: false,
        urls: [],
        error: "Only HTTPS URLs are permitted for attachments.",
      };
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.startsWith("169.254.") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.")
    ) {
      return {
        valid: false,
        urls: [],
        error: "Attachment URL points to a disallowed internal host.",
      };
    }
    cleaned.push(parsed.toString());
  }

  return { valid: true, urls: cleaned };
}

/**
 * Escapes an RFC 4180 CSV cell while neutralizing spreadsheet formula injection
 * (=, +, -, @, tab, CR) by prefixing hazardous leading characters with an apostrophe.
 */
export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return "";
  let str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

