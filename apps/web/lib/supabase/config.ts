/**
 * Centralized Server-Side Supabase Configuration & Environment Isolation.
 *
 * Ensures every server and middleware Supabase client validates:
 * - URL format and non-placeholder credentials
 * - Strict separation between local/dev/preview and production Supabase projects
 * - Proper role segregation between anon/publishable keys and service-role keys
 */

import {
  assertServerContext,
  EnvironmentValidationError,
  resolveAppEnvironment,
  validateServerEnv,
} from "@/lib/env/server";
import { isPlaceholderValue } from "@/lib/env/shared";

const SUPABASE_ERROR_CODES = new Set([
  "INVALID_APP_ENV",
  "INVALID_PUBLIC_APP_ENV",
  "MISMATCHED_APP_ENV",
  "PREVIEW_AS_PRODUCTION",
  "PRODUCTION_ENV_MISMATCH",
  "PRODUCTION_NODE_ENV_MISMATCH",
  "PUBLIC_SECRET_VARIABLE",
  "PUBLIC_SECRET_VALUE_LEAK",
  "ANON_KEY_IS_SERVICE_ROLE",
  "ANON_KEY_MATCHES_SERVICE_ROLE",
  "SERVICE_ROLE_KEY_IS_ANON",
  "MISSING_SUPABASE_URL",
  "INVALID_SUPABASE_URL",
  "LOCAL_SUPABASE_IN_PRODUCTION",
  "DEV_SUPABASE_IN_PRODUCTION",
  "WRONG_PRODUCTION_SUPABASE_REF",
  "LOCAL_SUPABASE_IN_PREVIEW",
  "PRODUCTION_SUPABASE_IN_NON_PROD",
  "UNAPPROVED_REMOTE_SUPABASE_IN_LOCAL",
  "MISSING_SUPABASE_ANON_KEY",
  "MISSING_SUPABASE_SERVICE_ROLE_KEY",
  "INVALID_BOOLEAN_FLAG",
]);

function validateSupabaseSubset(requireServiceRole: boolean) {
  assertServerContext("Supabase server configuration");

  const ctx = resolveAppEnvironment();
  const fullValidation = validateServerEnv({
    requireServiceRole,
    requireBusinessConfigInProd: false,
    requireExplicitFlagsInProd: false,
  });

  const relevantErrors = fullValidation.errors.filter((issue) =>
    SUPABASE_ERROR_CODES.has(issue.code)
  );

  if (relevantErrors.length > 0) {
    const summary = relevantErrors
      .map((e) => `[${e.code}] (${e.variable}): ${e.message}`)
      .join("\n- ");
    throw new EnvironmentValidationError(
      `Supabase configuration error in "${ctx.appEnv}" environment:\n- ${summary}`,
      relevantErrors,
      ctx.appEnv
    );
  }

  return ctx;
}

/**
 * Returns validated Supabase URL and public anon key for SSR, Route Handlers, and Middleware.
 * Never exposes or reads SUPABASE_SERVICE_ROLE_KEY.
 */
export function getServerSupabaseConfig(): {
  supabaseUrl: string;
  supabaseAnonKey: string;
  appEnv: string;
} {
  const ctx = validateSupabaseSubset(false);
  return {
    supabaseUrl: (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
    supabaseAnonKey: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim(),
    appEnv: ctx.appEnv,
  };
}

/**
 * Returns validated Supabase URL and privileged SERVICE_ROLE_KEY for admin server operations.
 */
export function getAdminSupabaseConfig(): {
  supabaseUrl: string;
  serviceRoleKey: string;
  appEnv: string;
} {
  const ctx = validateSupabaseSubset(true);
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!serviceRoleKey || isPlaceholderValue(serviceRoleKey)) {
    throw new Error(
      "Missing or placeholder SUPABASE_SERVICE_ROLE_KEY for admin Supabase client."
    );
  }

  return {
    supabaseUrl: (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
    serviceRoleKey,
    appEnv: ctx.appEnv,
  };
}
