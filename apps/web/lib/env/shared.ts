/**
 * Shared environment classification, URL/key inspection helpers, and types.
 * Safe for both client and server modules (contains NO server-only secret reads).
 */

export type AppEnvironment =
  | "local"
  | "development"
  | "test"
  | "preview"
  | "staging"
  | "production"
  | "unknown";

export type ServiceExecutionMode = "disabled" | "mock" | "sandbox" | "live";

export type ServiceKey = "razorpay" | "emails" | "cloudinary" | "delhivery";

export interface EnvValidationIssue {
  severity: "error" | "warning";
  code: string;
  variable: string;
  message: string;
}

export interface EnvValidationResult {
  valid: boolean;
  appEnv: AppEnvironment;
  nodeEnv: string | undefined;
  vercelEnv: string | undefined;
  errors: EnvValidationIssue[];
  warnings: EnvValidationIssue[];
}

export const DELHIVERY_PRODUCTION_URL = "https://track.delhivery.com";
export const DELHIVERY_STAGING_URL = "https://staging-express.delhivery.com";

export const VALID_APP_ENVIRONMENTS = new Set<AppEnvironment>([
  "local",
  "development",
  "test",
  "preview",
  "staging",
  "production",
]);

const EXACT_PLACEHOLDER_VALUES = new Set([
  "changeme",
  "placeholder",
  "todo",
  "none",
  "null",
  "undefined",
  "example",
  "07aaaaa0000a1z5",
  "demo",
]);

const DEV_FALLBACK_GSTIN = "07AABCM1234F1ZZ";

const NON_PRODUCTION_PLACEHOLDER_GSTINS = new Set([
  "07AAAAA0000A1Z5",
  "07AABCM1234F1Z5",
  "07AABCM1234F1ZZ",
  "07ABCDE1234F1Z5",
]);

const GSTIN_CODEPOINT_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_FORMAT_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * Checks whether a 2-digit state code is an official Indian GST jurisdiction code.
 */
export function isValidGstStateCode(code: string | undefined | null): boolean {
  if (!code) return false;
  const clean = code.trim();
  if (!/^[0-9]{2}$/.test(clean)) return false;
  const num = Number(clean);
  return (num >= 1 && num <= 38) || num === 97 || num === 99;
}

/**
 * Computes the Indian GSTIN Luhn mod-36 check character for a 14-character prefix.
 */
export function calculateGstinCheckDigit(gstin14: string): string | null {
  const clean = gstin14.trim().toUpperCase();
  if (clean.length !== 14) return null;

  let factor = 1;
  let total = 0;

  for (const ch of clean) {
    const codePoint = GSTIN_CODEPOINT_CHARS.indexOf(ch);
    if (codePoint < 0) return null;

    const product = codePoint * factor;
    total += Math.floor(product / 36) + (product % 36);
    factor = factor === 1 ? 2 : 1;
  }

  const remainder = total % 36;
  const checkIndex = (36 - remainder) % 36;
  return GSTIN_CODEPOINT_CHARS[checkIndex] || null;
}

/**
 * Validates Indian 15-character GSTIN format, state jurisdiction code, and mod-36 check digit.
 */
export function validateIndianGstin(gstin: string | undefined | null): {
  valid: boolean;
  normalized: string;
  stateCode?: string;
  reason?: string;
} {
  if (!gstin || typeof gstin !== "string") {
    return { valid: false, normalized: "", reason: "GSTIN is required." };
  }

  const normalized = gstin.trim().toUpperCase();
  if (normalized.length !== 15) {
    return { valid: false, normalized, reason: "GSTIN must be exactly 15 characters." };
  }

  if (!GSTIN_FORMAT_REGEX.test(normalized)) {
    return { valid: false, normalized, reason: "GSTIN format does not match Indian GSTIN structure." };
  }

  const stateCode = normalized.slice(0, 2);
  if (!isValidGstStateCode(stateCode)) {
    return { valid: false, normalized, reason: `Invalid GST state jurisdiction code "${stateCode}".` };
  }

  const expectedCheckDigit = calculateGstinCheckDigit(normalized.slice(0, 14));
  if (!expectedCheckDigit || normalized[14] !== expectedCheckDigit) {
    return {
      valid: false,
      normalized,
      reason: `GSTIN check digit mismatch (expected "${expectedCheckDigit ?? "?"}", got "${normalized[14]}").`,
    };
  }

  return { valid: true, normalized, stateCode };
}

export function getDevFallbackGstin(): string {
  return DEV_FALLBACK_GSTIN;
}

export const KNOWN_DEV_OTP_FALLBACK_SECRETS = new Set([
  "fallback_phone_otp_secret_key",
  "md_shakib_delivery_otp_secure_hmac_secret_2026",
  "dev_only_local_otp_hmac_secret_do_not_use_in_prod",
]);

/**
 * Checks whether a value is empty or an unconfigured template placeholder.
 */
export function isPlaceholderValue(value: string | undefined | null): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;

  const lower = trimmed.toLowerCase();
  if (EXACT_PLACEHOLDER_VALUES.has(lower)) return true;
  if (lower.startsWith("your_") || lower.startsWith("your-")) return true;
  if (lower.startsWith("replace-with-") || lower.startsWith("replace_with_")) return true;
  if (lower.includes("your-project.supabase.co")) return true;
  if (lower.includes("your_key_id") || lower.includes("your_resend_api_key")) return true;
  if (lower.includes("your_delhivery") || lower.includes("your_cloud_name")) return true;
  if (lower.includes("your_razorpay") || lower.includes("your_supabase")) return true;
  if (lower.includes("your-supabase") || lower.includes("your-local-or-dev")) return true;
  if (lower.startsWith("<") && lower.endsWith(">")) return true;

  return false;
}

/**
 * Checks whether a token or key explicitly represents a mock or demo value.
 */
export function isMockTokenValue(value: string | undefined | null): boolean {
  if (!value) return false;
  const lower = value.trim().toLowerCase();
  if (!lower) return false;
  return (
    lower.startsWith("mock") ||
    lower.startsWith("re_mock") ||
    lower.startsWith("rzp_test_mock") ||
    lower.startsWith("fake_") ||
    lower.startsWith("dummy_") ||
    lower === "demo"
  );
}

/**
 * Checks whether a GSTIN string matches India's 15-character GSTIN format
 * and is not a placeholder or development fallback GSTIN.
 */
export function isValidProductionGstin(gstin: string | undefined | null): boolean {
  if (!gstin) return false;
  const check = validateIndianGstin(gstin);
  if (!check.valid) return false;
  if (NON_PRODUCTION_PLACEHOLDER_GSTINS.has(check.normalized)) {
    return false;
  }
  return true;
}

/**
 * Parses a strict boolean environment flag ("true" | "false").
 * Returns `explicit: false` and `defaultValue` when unset.
 */
export function parseStrictBooleanEnv(
  raw: string | undefined,
  variableName: string,
  defaultValue: boolean
): { value: boolean; explicit: boolean; error?: string } {
  if (raw === undefined || raw.trim() === "") {
    return { value: defaultValue, explicit: false };
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === "true") {
    return { value: true, explicit: true };
  }
  if (normalized === "false") {
    return { value: false, explicit: true };
  }

  return {
    value: defaultValue,
    explicit: true,
    error: `${variableName} must be explicitly set to "true" or "false" when provided.`,
  };
}

/**
 * Parses an HTTP or HTTPS URL safely without throwing.
 */
export function parseHttpUrl(raw: string | undefined | null): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

/**
 * Returns true if the URL points to a loopback / local development hostname.
 */
export function isLocalhostUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host === "0.0.0.0" ||
    host === "host.docker.internal" ||
    host.endsWith(".local")
  );
}

/**
 * Extracts the Supabase project reference from a standard `<ref>.supabase.co` URL.
 */
export function extractSupabaseProjectRef(urlStr: string | undefined | null): string | null {
  const url = parseHttpUrl(urlStr);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  if (host.endsWith(".supabase.co")) {
    const parts = host.split(".");
    if (parts.length >= 3 && parts[0]) {
      return parts[0];
    }
  }
  return null;
}

/**
 * Decodes base64url JSON payloads safely in both Node.js and browser/Edge runtimes.
 */
function decodeBase64UrlToString(segment: string): string | null {
  try {
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (base64.length % 4)) % 4;
    const padded = base64 + "=".repeat(padLength);

    if (typeof Buffer !== "undefined") {
      return Buffer.from(padded, "base64").toString("utf8");
    }
    if (typeof atob === "function") {
      return atob(padded);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Inspects a Supabase key's structural role without logging or exposing the secret value.
 */
export function inspectSupabaseKeyRole(
  key: string | undefined | null
): "anon" | "service_role" | "publishable" | "secret" | "unknown" {
  if (!key) return "unknown";
  const trimmed = key.trim();
  if (!trimmed) return "unknown";

  if (trimmed.startsWith("sb_secret_")) return "secret";
  if (trimmed.startsWith("sb_publishable_")) return "publishable";

  const parts = trimmed.split(".");
  if (parts.length === 3 && parts[1]) {
    const decoded = decodeBase64UrlToString(parts[1]);
    if (decoded) {
      try {
        const parsed = JSON.parse(decoded) as { role?: string };
        if (parsed?.role === "service_role") return "service_role";
        if (parsed?.role === "anon") return "anon";
      } catch {
        return "unknown";
      }
    }
  }

  return "unknown";
}

/**
 * Normalizes APP_ENV / NEXT_PUBLIC_APP_ENV string to a known AppEnvironment.
 */
export function normalizeAppEnvironment(raw: string | undefined | null): AppEnvironment | null {
  if (!raw || !raw.trim()) return null;
  const normalized = raw.trim().toLowerCase() as AppEnvironment;
  if (VALID_APP_ENVIRONMENTS.has(normalized)) {
    return normalized;
  }
  return null;
}
