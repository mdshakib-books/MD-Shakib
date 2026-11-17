/**
 * Client-safe public environment variable accessor and validator.
 *
 * Strictly accesses only `NEXT_PUBLIC_*` variables and `NODE_ENV` via static property lookups
 * so Next.js/Turbopack can safely inline them in browser bundles without referencing server secrets.
 */

import {
  extractSupabaseProjectRef,
  inspectSupabaseKeyRole,
  isLocalhostUrl,
  isMockTokenValue,
  isPlaceholderValue,
  normalizeAppEnvironment,
  parseHttpUrl,
  type AppEnvironment,
} from "./shared";

export interface PublicEnvConfig {
  appEnv: AppEnvironment;
  nodeEnv: string;
  siteUrl: string | null;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseProjectRef: string | null;
  razorpayKeyId: string;
  cloudinaryCloudName: string;
  allowTestRazorpayInProd?: boolean;
}

/**
 * Validates and returns public (browser-safe) environment configuration.
 */
export function getPublicEnv(): PublicEnvConfig {
  const nodeEnv = process.env.NODE_ENV || "development";
  const rawAppEnv = process.env.NEXT_PUBLIC_APP_ENV;
  const normalizedAppEnv = normalizeAppEnvironment(rawAppEnv);

  if (rawAppEnv && rawAppEnv.trim() && !normalizedAppEnv) {
    throw new Error(
      `Invalid NEXT_PUBLIC_APP_ENV value. Expected one of: local, development, test, preview, staging, production.`
    );
  }

  const appEnv: AppEnvironment =
    normalizedAppEnv ||
    (nodeEnv === "production"
      ? "production"
      : nodeEnv === "test"
      ? "test"
      : nodeEnv === "development"
      ? "local"
      : "unknown");

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  const rawSiteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""
  ).trim();
  const razorpayKeyId = (process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "").trim();
  const cloudinaryCloudName = (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "").trim();

  // Protect browser bundles from accidentally receiving privileged service-role keys
  const anonKeyRole = inspectSupabaseKeyRole(supabaseAnonKey);
  if (anonKeyRole === "service_role" || anonKeyRole === "secret") {
    throw new Error(
      "Security violation: A privileged Supabase service-role/secret key is configured in NEXT_PUBLIC_SUPABASE_ANON_KEY. Replace it with the public anon/publishable key immediately."
    );
  }

  const isNonProdEnv =
    appEnv === "local" ||
    appEnv === "development" ||
    appEnv === "test" ||
    appEnv === "preview" ||
    appEnv === "staging";

  if (isNonProdEnv && razorpayKeyId.startsWith("rzp_live_")) {
    throw new Error(
      `Security violation: Live Razorpay key (NEXT_PUBLIC_RAZORPAY_KEY_ID) is prohibited in "${appEnv}" environment.`
    );
  }

  const allowTestRazorpayInProd =
    process.env.NEXT_PUBLIC_ALLOW_TEST_RAZORPAY_IN_PROD === "true" ||
    process.env.ALLOW_TEST_RAZORPAY_IN_PROD === "true";

  if (appEnv === "production" && razorpayKeyId) {
    if (isMockTokenValue(razorpayKeyId)) {
      throw new Error(
        "Configuration error: Test or mock Razorpay key ID is prohibited in production."
      );
    }
    if (razorpayKeyId.startsWith("rzp_test_") && !allowTestRazorpayInProd) {
      throw new Error(
        "Configuration error: Test or mock Razorpay key ID is prohibited in production."
      );
    }
  }

  return {
    appEnv,
    nodeEnv,
    siteUrl: rawSiteUrl ? rawSiteUrl.replace(/\/+$/, "") : null,
    supabaseUrl,
    supabaseAnonKey,
    supabaseProjectRef: extractSupabaseProjectRef(supabaseUrl),
    razorpayKeyId,
    cloudinaryCloudName,
    allowTestRazorpayInProd,
  };
}

/**
 * Validates public Supabase URL and anon key before initializing a browser Supabase client.
 */
export function assertValidPublicSupabaseEnv(): {
  supabaseUrl: string;
  supabaseAnonKey: string;
} {
  const pub = getPublicEnv();

  if (!pub.supabaseUrl || isPlaceholderValue(pub.supabaseUrl)) {
    throw new Error(
      "Missing or placeholder NEXT_PUBLIC_SUPABASE_URL. Configure your Supabase project URL in environment variables."
    );
  }

  const parsedUrl = parseHttpUrl(pub.supabaseUrl);
  if (!parsedUrl) {
    throw new Error(
      "Invalid NEXT_PUBLIC_SUPABASE_URL format. Must be a valid http:// or https:// URL."
    );
  }

  if (
    (pub.appEnv === "production" || pub.appEnv === "preview" || pub.appEnv === "staging") &&
    (isLocalhostUrl(parsedUrl) || parsedUrl.protocol !== "https:")
  ) {
    throw new Error(
      `Invalid NEXT_PUBLIC_SUPABASE_URL for "${pub.appEnv}": must be a remote HTTPS Supabase endpoint, not localhost/HTTP.`
    );
  }

  if (!pub.supabaseAnonKey || isPlaceholderValue(pub.supabaseAnonKey)) {
    throw new Error(
      "Missing or placeholder NEXT_PUBLIC_SUPABASE_ANON_KEY. Configure the public anon/publishable key."
    );
  }

  return {
    supabaseUrl: pub.supabaseUrl,
    supabaseAnonKey: pub.supabaseAnonKey,
  };
}
