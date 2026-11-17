/**
 * Authoritative Server-Only Environment Configuration & Validation Engine.
 *
 * SECURITY INVARIANTS:
 * - Strictly prohibited from running in browser contexts (`typeof window !== "undefined"`).
 * - Never prints, logs, or includes raw secret values in error messages or diagnostics.
 * - Enforces strict separation between local/test, preview/staging, and production environments.
 * - Fails closed on missing/invalid credentials, exposed privileged keys, or mocks in production.
 */

import {
  DELHIVERY_PRODUCTION_URL,
  DELHIVERY_STAGING_URL,
  extractSupabaseProjectRef,
  inspectSupabaseKeyRole,
  isLocalhostUrl,
  isMockTokenValue,
  isPlaceholderValue,
  isValidProductionGstin,
  KNOWN_DEV_OTP_FALLBACK_SECRETS,
  normalizeAppEnvironment,
  parseHttpUrl,
  parseStrictBooleanEnv,
  type AppEnvironment,
  type EnvValidationIssue,
  type EnvValidationResult,
  type ServiceExecutionMode,
  type ServiceKey,
} from "./shared";

const PROHIBITED_NEXT_PUBLIC_SECRET_NAMES = new Set([
  "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_RAZORPAY_KEY_SECRET",
  "NEXT_PUBLIC_RAZORPAY_WEBHOOK_SECRET",
  "NEXT_PUBLIC_RESEND_API_KEY",
  "NEXT_PUBLIC_CLOUDINARY_API_KEY",
  "NEXT_PUBLIC_CLOUDINARY_API_SECRET",
  "NEXT_PUBLIC_DELHIVERY_TOKEN",
  "NEXT_PUBLIC_DELHIVERY_WEBHOOK_SECRET",
  "NEXT_PUBLIC_DELIVERY_OTP_HMAC_SECRET",
  "NEXT_PUBLIC_CRON_SECRET",
]);

const SERVER_ONLY_SECRET_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "DELHIVERY_TOKEN",
  "DELHIVERY_WEBHOOK_SECRET",
  "DELIVERY_OTP_HMAC_SECRET",
  "CRON_SECRET",
] as const;

export function assertServerContext(caller = "Server environment configuration"): void {
  if (typeof window !== "undefined") {
    throw new Error(
      `Security violation: ${caller} is server-only and cannot be imported or executed in browser code.`
    );
  }
}

export class EnvironmentValidationError extends Error {
  public readonly issues: EnvValidationIssue[];
  public readonly appEnv: AppEnvironment;

  constructor(message: string, issues: EnvValidationIssue[], appEnv: AppEnvironment) {
    super(message);
    this.name = "EnvironmentValidationError";
    this.issues = issues;
    this.appEnv = appEnv;
  }
}

export interface ResolvedAppContext {
  appEnv: AppEnvironment;
  nodeEnv: string | undefined;
  vercelEnv: string | undefined;
  isProduction: boolean;
  isPreviewOrStaging: boolean;
  isLocalOrTest: boolean;
  isLocalOrTestRuntime: boolean;
  isNextBuildPhase: boolean;
  issues: EnvValidationIssue[];
}

/**
 * Resolves the authoritative application environment from APP_ENV, NEXT_PUBLIC_APP_ENV,
 * VERCEL_ENV, and NODE_ENV while catching contradictory environment configurations.
 */
export function resolveAppEnvironment(): ResolvedAppContext {
  assertServerContext("resolveAppEnvironment");

  const issues: EnvValidationIssue[] = [];
  const nodeEnv = process.env.NODE_ENV;
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase() || undefined;
  const isNextBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

  const rawAppEnv = process.env.APP_ENV;
  const rawPublicAppEnv = process.env.NEXT_PUBLIC_APP_ENV;

  const parsedAppEnv = normalizeAppEnvironment(rawAppEnv);
  const parsedPublicAppEnv = normalizeAppEnvironment(rawPublicAppEnv);

  if (rawAppEnv && rawAppEnv.trim() && !parsedAppEnv) {
    issues.push({
      severity: "error",
      code: "INVALID_APP_ENV",
      variable: "APP_ENV",
      message:
        "APP_ENV has an unsupported value. Allowed values: local, development, test, preview, staging, production.",
    });
  }

  if (rawPublicAppEnv && rawPublicAppEnv.trim() && !parsedPublicAppEnv) {
    issues.push({
      severity: "error",
      code: "INVALID_PUBLIC_APP_ENV",
      variable: "NEXT_PUBLIC_APP_ENV",
      message:
        "NEXT_PUBLIC_APP_ENV has an unsupported value. Allowed values: local, development, test, preview, staging, production.",
    });
  }

  if (parsedAppEnv && parsedPublicAppEnv && parsedAppEnv !== parsedPublicAppEnv) {
    issues.push({
      severity: "error",
      code: "MISMATCHED_APP_ENV",
      variable: "APP_ENV",
      message: `APP_ENV ("${parsedAppEnv}") and NEXT_PUBLIC_APP_ENV ("${parsedPublicAppEnv}") must match.`,
    });
  }

  let appEnv: AppEnvironment = parsedAppEnv || parsedPublicAppEnv || "unknown";

  if (appEnv === "unknown") {
    if (vercelEnv === "preview") {
      appEnv = "preview";
    } else if (vercelEnv === "production") {
      appEnv = "production";
    } else if (vercelEnv === "development") {
      appEnv = "local";
    } else if (nodeEnv === "production") {
      appEnv = "production";
    } else if (nodeEnv === "test") {
      appEnv = "test";
    } else if (nodeEnv === "development") {
      appEnv = "local";
    } else if (nodeEnv === "staging") {
      appEnv = "staging";
    }
  }

  // Vercel environment cross-guards
  if (vercelEnv === "preview" && appEnv === "production") {
    issues.push({
      severity: "error",
      code: "PREVIEW_AS_PRODUCTION",
      variable: "VERCEL_ENV",
      message:
        "Preview deployment (VERCEL_ENV=preview) cannot run with APP_ENV=production.",
    });
  }

  if (vercelEnv === "production" && appEnv !== "production") {
    issues.push({
      severity: "error",
      code: "PRODUCTION_ENV_MISMATCH",
      variable: "APP_ENV",
      message: `Vercel production deployment (VERCEL_ENV=production) cannot run with APP_ENV="${appEnv}".`,
    });
  }

  if (appEnv === "production" && nodeEnv !== "production") {
    issues.push({
      severity: "error",
      code: "PRODUCTION_NODE_ENV_MISMATCH",
      variable: "NODE_ENV",
      message: `APP_ENV="production" requires NODE_ENV="production" (received "${nodeEnv || "unset"}").`,
    });
  }

  const isProduction = appEnv === "production";
  const isPreviewOrStaging = appEnv === "preview" || appEnv === "staging";
  const isLocalOrTest = appEnv === "local" || appEnv === "development" || appEnv === "test";

  // Mocks are strictly limited to non-production Node runtime + non-production APP_ENV
  const isLocalOrTestRuntime =
    isLocalOrTest && (nodeEnv === "development" || nodeEnv === "test");

  return {
    appEnv,
    nodeEnv,
    vercelEnv,
    isProduction,
    isPreviewOrStaging,
    isLocalOrTest,
    isLocalOrTestRuntime,
    isNextBuildPhase,
    issues,
  };
}

export interface ValidateServerEnvOptions {
  requireServiceRole?: boolean;
  requireBusinessConfigInProd?: boolean;
  requireExplicitFlagsInProd?: boolean;
}

/**
 * Checks that no server-only secret is exposed via NEXT_PUBLIC_* env names or values.
 */
function checkSecretExposure(issues: EnvValidationIssue[]): void {
  const secretValues = new Set<string>();
  for (const key of SERVER_ONLY_SECRET_KEYS) {
    const val = (process.env[key] || "").trim();
    if (val && !isPlaceholderValue(val) && val.length >= 8) {
      secretValues.add(val);
    }
  }

  for (const envKey of Object.keys(process.env)) {
    if (!envKey.startsWith("NEXT_PUBLIC_")) continue;

    const val = (process.env[envKey] || "").trim();
    const upperKey = envKey.toUpperCase();

    if (
      PROHIBITED_NEXT_PUBLIC_SECRET_NAMES.has(upperKey) ||
      /_(SECRET|TOKEN|PRIVATE_KEY|PASSWORD|SERVICE_ROLE)$/.test(upperKey) ||
      upperKey.includes("SERVICE_ROLE")
    ) {
      if (val) {
        issues.push({
          severity: "error",
          code: "PUBLIC_SECRET_VARIABLE",
          variable: envKey,
          message: `Security violation: Server-only secret variable "${envKey}" must never use the NEXT_PUBLIC_ prefix.`,
        });
      }
      continue;
    }

    // Detect if a server secret value was accidentally copied into a NEXT_PUBLIC_* variable
    if (val && secretValues.has(val)) {
      issues.push({
        severity: "error",
        code: "PUBLIC_SECRET_VALUE_LEAK",
        variable: envKey,
        message: `Security violation: "${envKey}" contains a value matching a server-only secret.`,
      });
    }
  }

  // Verify anon key does not carry service_role privileges
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  const anonRole = inspectSupabaseKeyRole(anonKey);
  if (anonRole === "service_role" || anonRole === "secret") {
    issues.push({
      severity: "error",
      code: "ANON_KEY_IS_SERVICE_ROLE",
      variable: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      message:
        "Security violation: NEXT_PUBLIC_SUPABASE_ANON_KEY holds a privileged service-role/secret key.",
    });
  }

  if (anonKey && serviceKey && !isPlaceholderValue(anonKey) && anonKey === serviceKey) {
    issues.push({
      severity: "error",
      code: "ANON_KEY_MATCHES_SERVICE_ROLE",
      variable: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      message:
        "Security violation: NEXT_PUBLIC_SUPABASE_ANON_KEY must not equal SUPABASE_SERVICE_ROLE_KEY.",
    });
  }

  if (serviceKey && !isPlaceholderValue(serviceKey)) {
    const serviceRole = inspectSupabaseKeyRole(serviceKey);
    if (serviceRole === "anon" || serviceRole === "publishable") {
      issues.push({
        severity: "error",
        code: "SERVICE_ROLE_KEY_IS_ANON",
        variable: "SUPABASE_SERVICE_ROLE_KEY",
        message:
          "Configuration error: SUPABASE_SERVICE_ROLE_KEY contains a public anon/publishable key instead of a service-role key.",
      });
    }
  }
}

/**
 * Validates Supabase URL, keys, and strict dev/preview/production project isolation.
 */
function checkSupabaseIsolation(
  ctx: ResolvedAppContext,
  options: ValidateServerEnvOptions,
  issues: EnvValidationIssue[]
): void {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const requireServiceRole = options.requireServiceRole ?? ctx.isProduction;

  if (!supabaseUrl || isPlaceholderValue(supabaseUrl)) {
    issues.push({
      severity: "error",
      code: "MISSING_SUPABASE_URL",
      variable: "NEXT_PUBLIC_SUPABASE_URL",
      message: "NEXT_PUBLIC_SUPABASE_URL is missing or set to a template placeholder.",
    });
  } else {
    const parsed = parseHttpUrl(supabaseUrl);
    if (!parsed) {
      issues.push({
        severity: "error",
        code: "INVALID_SUPABASE_URL",
        variable: "NEXT_PUBLIC_SUPABASE_URL",
        message: "NEXT_PUBLIC_SUPABASE_URL must be a valid http:// or https:// URL.",
      });
    } else {
      const projectRef = extractSupabaseProjectRef(supabaseUrl);
      const localhost = isLocalhostUrl(parsed);

      const prodUrlRaw = (process.env.SUPABASE_PRODUCTION_URL || "").trim();
      const prodUrlParsed = parseHttpUrl(prodUrlRaw);
      const prodRef =
        (process.env.SUPABASE_PRODUCTION_PROJECT_REF || "").trim() ||
        (prodUrlRaw ? extractSupabaseProjectRef(prodUrlRaw) : null);
      const devRef = (process.env.SUPABASE_DEV_PROJECT_REF || "").trim();
      const allowRemoteDev = parseStrictBooleanEnv(
        process.env.SUPABASE_ALLOW_REMOTE_DEV,
        "SUPABASE_ALLOW_REMOTE_DEV",
        false
      );

      if (allowRemoteDev.error) {
        issues.push({
          severity: "error",
          code: "INVALID_BOOLEAN_FLAG",
          variable: "SUPABASE_ALLOW_REMOTE_DEV",
          message: allowRemoteDev.error,
        });
      }

      if (ctx.isProduction) {
        if (localhost || parsed.protocol !== "https:") {
          issues.push({
            severity: "error",
            code: "LOCAL_SUPABASE_IN_PRODUCTION",
            variable: "NEXT_PUBLIC_SUPABASE_URL",
            message:
              "Production environment cannot use localhost or plain HTTP for NEXT_PUBLIC_SUPABASE_URL.",
          });
        }
        if (devRef && projectRef && projectRef === devRef) {
          issues.push({
            severity: "error",
            code: "DEV_SUPABASE_IN_PRODUCTION",
            variable: "NEXT_PUBLIC_SUPABASE_URL",
            message:
              "Production environment is pointing to SUPABASE_DEV_PROJECT_REF. Use the dedicated production Supabase project.",
          });
        }
        if (prodRef && projectRef && projectRef !== prodRef) {
          issues.push({
            severity: "error",
            code: "WRONG_PRODUCTION_SUPABASE_REF",
            variable: "NEXT_PUBLIC_SUPABASE_URL",
            message:
              "NEXT_PUBLIC_SUPABASE_URL project ref does not match SUPABASE_PRODUCTION_PROJECT_REF.",
          });
        }
      } else {
        // Non-production (local, development, test, preview, staging)
        if ((ctx.isPreviewOrStaging) && (localhost || parsed.protocol !== "https:")) {
          issues.push({
            severity: "error",
            code: "LOCAL_SUPABASE_IN_PREVIEW",
            variable: "NEXT_PUBLIC_SUPABASE_URL",
            message: `${ctx.appEnv} environment cannot use localhost or plain HTTP for NEXT_PUBLIC_SUPABASE_URL; configure a dedicated staging/development Supabase project.`,
          });
        }

        if (
          (prodRef && projectRef && projectRef === prodRef) ||
          (prodUrlParsed && prodUrlParsed.origin === parsed.origin)
        ) {
          issues.push({
            severity: "error",
            code: "PRODUCTION_SUPABASE_IN_NON_PROD",
            variable: "NEXT_PUBLIC_SUPABASE_URL",
            message: `Security violation: ${ctx.appEnv} environment must never connect to the production Supabase project.`,
          });
        }

        // Block accidental remote *.supabase.co connections in local dev/test unless explicitly bound to a dev project ref
        if (ctx.isLocalOrTest && !localhost) {
          if (!allowRemoteDev.value || !devRef || !projectRef || projectRef !== devRef) {
            issues.push({
              severity: "error",
              code: "UNAPPROVED_REMOTE_SUPABASE_IN_LOCAL",
              variable: "NEXT_PUBLIC_SUPABASE_URL",
              message:
                "Local/test environment points to a remote Supabase URL without explicit isolation. Use local Supabase (http://127.0.0.1:54321) or set SUPABASE_ALLOW_REMOTE_DEV=true and matching SUPABASE_DEV_PROJECT_REF for a dedicated dev project.",
            });
          }
        }
      }
    }
  }

  if (!anonKey || isPlaceholderValue(anonKey)) {
    issues.push({
      severity: "error",
      code: "MISSING_SUPABASE_ANON_KEY",
      variable: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      message: "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing or set to a template placeholder.",
    });
  }

  if (requireServiceRole && (!serviceKey || isPlaceholderValue(serviceKey))) {
    issues.push({
      severity: "error",
      code: "MISSING_SUPABASE_SERVICE_ROLE_KEY",
      variable: "SUPABASE_SERVICE_ROLE_KEY",
      message: "SUPABASE_SERVICE_ROLE_KEY is required on the server and must not be a placeholder.",
    });
  }
}

export interface ServiceConfigResolved {
  enabled: boolean;
  explicitFlag: boolean;
  mode: ServiceExecutionMode;
  isConfigured: boolean;
  operational: boolean;
}

export interface ResolvedIntegrationsSnapshot {
  context: ResolvedAppContext;
  allowMockServices: boolean;
  services: {
    razorpay: ServiceConfigResolved & {
      keyId: string;
      keySecret: string;
      webhookSecret: string;
    };
    emails: ServiceConfigResolved & {
      apiKey: string;
      fromEmail: string;
      supportEmail: string;
      adminAlertEmail: string;
    };
    cloudinary: ServiceConfigResolved & {
      cloudName: string;
      apiKey: string;
      apiSecret: string;
    };
    delhivery: ServiceConfigResolved & {
      token: string;
      webhookSecret: string;
      apiUrl: string;
      pickupLocation: string;
    };
  };
  issues: EnvValidationIssue[];
}

/**
 * Checks whether a Delhivery API token is present and not a mock or template placeholder.
 */
export function isValidDelhiveryTokenValue(token: string): boolean {
  const normalized = token.trim();
  if (!normalized) return false;
  if (isPlaceholderValue(normalized) || isMockTokenValue(normalized)) return false;
  return true;
}

function resolveServiceMode(params: {
  flag: { value: boolean; explicit: boolean };
  allowMockServices: boolean;
  ctx: ResolvedAppContext;
}): ServiceExecutionMode {
  const { flag, allowMockServices, ctx } = params;
  if (flag.value) {
    return ctx.isProduction ? "live" : "sandbox";
  }
  // Explicit "false" forces disabled even if ALLOW_MOCK_SERVICES=true
  if (!flag.explicit && allowMockServices && ctx.isLocalOrTestRuntime) {
    return "mock";
  }
  return "disabled";
}

/**
 * Resolves all external service configurations, kill switches, and execution modes,
 * recording any environment or credential safety violations.
 */
export function resolveServerIntegrations(
  options: { requireExplicitFlagsInProd?: boolean } = {}
): ResolvedIntegrationsSnapshot {
  assertServerContext("resolveServerIntegrations");

  const ctx = resolveAppEnvironment();
  const issues: EnvValidationIssue[] = [...ctx.issues];

  const allowMockParsed = parseStrictBooleanEnv(
    process.env.ALLOW_MOCK_SERVICES,
    "ALLOW_MOCK_SERVICES",
    false
  );
  if (allowMockParsed.error) {
    issues.push({
      severity: "error",
      code: "INVALID_BOOLEAN_FLAG",
      variable: "ALLOW_MOCK_SERVICES",
      message: allowMockParsed.error,
    });
  }

  if (allowMockParsed.value && !ctx.isLocalOrTestRuntime) {
    issues.push({
      severity: "error",
      code: "MOCK_SERVICES_FORBIDDEN",
      variable: "ALLOW_MOCK_SERVICES",
      message: `Security violation: ALLOW_MOCK_SERVICES=true is strictly prohibited in "${ctx.appEnv}" (NODE_ENV="${ctx.nodeEnv || "unset"}").`,
    });
  }

  const allowMockServices = allowMockParsed.value && ctx.isLocalOrTestRuntime;

  // Parse service kill switches (safe default: false)
  const enableRazorpay = parseStrictBooleanEnv(process.env.ENABLE_RAZORPAY, "ENABLE_RAZORPAY", false);
  const enableEmails = parseStrictBooleanEnv(process.env.ENABLE_EMAILS, "ENABLE_EMAILS", false);
  const enableCloudinary = parseStrictBooleanEnv(process.env.ENABLE_CLOUDINARY, "ENABLE_CLOUDINARY", false);
  const enableDelhivery = parseStrictBooleanEnv(process.env.ENABLE_DELHIVERY, "ENABLE_DELHIVERY", false);

  const flagEntries: Array<[string, { value: boolean; explicit: boolean; error?: string }]> = [
    ["ENABLE_RAZORPAY", enableRazorpay],
    ["ENABLE_EMAILS", enableEmails],
    ["ENABLE_CLOUDINARY", enableCloudinary],
    ["ENABLE_DELHIVERY", enableDelhivery],
  ];

  for (const [varName, parsed] of flagEntries) {
    if (parsed.error) {
      issues.push({
        severity: "error",
        code: "INVALID_BOOLEAN_FLAG",
        variable: varName,
        message: parsed.error,
      });
    }
    if (options.requireExplicitFlagsInProd && ctx.isProduction && !parsed.explicit) {
      issues.push({
        severity: "error",
        code: "MISSING_PROD_SERVICE_FLAG",
        variable: varName,
        message: `Production environment requires ${varName} to be explicitly set to "true" or "false".`,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Razorpay
  // ---------------------------------------------------------------------------
  const publicRzpKeyId = (process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "").trim();
  const legacyRzpKeyId = (process.env.RAZORPAY_KEY_ID || "").trim();
  if (legacyRzpKeyId && !publicRzpKeyId) {
    issues.push({
      severity: "warning",
      code: "LEGACY_ENV_NAME",
      variable: "RAZORPAY_KEY_ID",
      message: "RAZORPAY_KEY_ID is deprecated; use NEXT_PUBLIC_RAZORPAY_KEY_ID.",
    });
  } else if (legacyRzpKeyId && publicRzpKeyId && legacyRzpKeyId !== publicRzpKeyId) {
    issues.push({
      severity: "error",
      code: "INCONSISTENT_RAZORPAY_KEY_ID",
      variable: "RAZORPAY_KEY_ID",
      message: "RAZORPAY_KEY_ID conflicts with NEXT_PUBLIC_RAZORPAY_KEY_ID. Remove legacy RAZORPAY_KEY_ID.",
    });
  }

  const razorpayKeyId = publicRzpKeyId || legacyRzpKeyId;
  const razorpayKeySecret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
  const razorpayWebhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();

  const rzpKeyIsLive = razorpayKeyId.startsWith("rzp_live_");
  const rzpKeyIsTest = razorpayKeyId.startsWith("rzp_test_") && !isMockTokenValue(razorpayKeyId);

  if (!ctx.isProduction && rzpKeyIsLive) {
    issues.push({
      severity: "error",
      code: "LIVE_RAZORPAY_KEY_IN_NON_PROD",
      variable: "NEXT_PUBLIC_RAZORPAY_KEY_ID",
      message: `Security violation: Live Razorpay key (rzp_live_*) is prohibited in "${ctx.appEnv}".`,
    });
  }

  if (ctx.isProduction && razorpayKeyId && (razorpayKeyId.startsWith("rzp_test_") || isMockTokenValue(razorpayKeyId))) {
    issues.push({
      severity: "error",
      code: "TEST_RAZORPAY_KEY_IN_PROD",
      variable: "NEXT_PUBLIC_RAZORPAY_KEY_ID",
      message: "Production environment cannot use Razorpay test or mock keys.",
    });
  }

  if (
    razorpayKeySecret &&
    (razorpayKeySecret === razorpayKeyId ||
      razorpayKeySecret.startsWith("rzp_test_") ||
      razorpayKeySecret.startsWith("rzp_live_"))
  ) {
    issues.push({
      severity: "error",
      code: "INVALID_RAZORPAY_SECRET_FORMAT",
      variable: "RAZORPAY_KEY_SECRET",
      message:
        "RAZORPAY_KEY_SECRET appears to contain a Razorpay Key ID instead of a Key Secret.",
    });
  }

  const razorpayValidCreds =
    !isPlaceholderValue(razorpayKeyId) &&
    !isMockTokenValue(razorpayKeyId) &&
    !isPlaceholderValue(razorpayKeySecret) &&
    !isMockTokenValue(razorpayKeySecret) &&
    !razorpayKeySecret.startsWith("rzp_test_") &&
    !razorpayKeySecret.startsWith("rzp_live_") &&
    razorpayKeySecret !== razorpayKeyId &&
    (ctx.isProduction ? rzpKeyIsLive : rzpKeyIsTest);

  if (enableRazorpay.value) {
    if (!razorpayValidCreds) {
      issues.push({
        severity: "error",
        code: "RAZORPAY_CREDENTIALS_INVALID",
        variable: "NEXT_PUBLIC_RAZORPAY_KEY_ID",
        message: ctx.isProduction
          ? "ENABLE_RAZORPAY=true in production requires valid live Razorpay credentials (rzp_live_* and RAZORPAY_KEY_SECRET)."
          : "ENABLE_RAZORPAY=true in non-production requires valid test Razorpay credentials (rzp_test_* and RAZORPAY_KEY_SECRET).",
      });
    }
    if (isPlaceholderValue(razorpayWebhookSecret) || isMockTokenValue(razorpayWebhookSecret)) {
      issues.push({
        severity: "error",
        code: "RAZORPAY_WEBHOOK_SECRET_MISSING",
        variable: "RAZORPAY_WEBHOOK_SECRET",
        message: "ENABLE_RAZORPAY=true requires a valid RAZORPAY_WEBHOOK_SECRET.",
      });
    }
  }

  const razorpayMode = resolveServiceMode({
    flag: enableRazorpay,
    allowMockServices,
    ctx,
  });

  // ---------------------------------------------------------------------------
  // 2. Resend / Email
  // ---------------------------------------------------------------------------
  const resendApiKey = (process.env.RESEND_API_KEY || "").trim();
  const emailFrom = (process.env.EMAIL_FROM || "MD Shakib Books <orders@mdshakib.com>").trim();
  const emailSupport = (process.env.EMAIL_SUPPORT || "support@mdshakib.com").trim();
  const adminAlertEmail = (
    process.env.ADMIN_ALERT_EMAIL ||
    process.env.ADMIN_EMAIL ||
    "orders@mdshakib.com"
  ).trim();

  if (
    ctx.isProduction &&
    resendApiKey &&
    (isMockTokenValue(resendApiKey) || resendApiKey.toLowerCase().startsWith("re_test"))
  ) {
    issues.push({
      severity: "error",
      code: "TEST_RESEND_KEY_IN_PROD",
      variable: "RESEND_API_KEY",
      message: "Production environment cannot use mock or test Resend API keys.",
    });
  }

  const resendValidCreds =
    !isPlaceholderValue(resendApiKey) &&
    !isMockTokenValue(resendApiKey) &&
    resendApiKey.startsWith("re_") &&
    !(ctx.isProduction && resendApiKey.toLowerCase().startsWith("re_test"));

  if (enableEmails.value) {
    if (!resendValidCreds) {
      issues.push({
        severity: "error",
        code: "RESEND_CREDENTIALS_INVALID",
        variable: "RESEND_API_KEY",
        message: "ENABLE_EMAILS=true requires a valid RESEND_API_KEY starting with 're_'.",
      });
    }
    if (!emailFrom || !emailFrom.includes("@")) {
      issues.push({
        severity: "error",
        code: "INVALID_EMAIL_FROM",
        variable: "EMAIL_FROM",
        message: "ENABLE_EMAILS=true requires a valid EMAIL_FROM address.",
      });
    }
  }

  const emailsMode = resolveServiceMode({
    flag: enableEmails,
    allowMockServices,
    ctx,
  });

  // ---------------------------------------------------------------------------
  // 3. Cloudinary
  // ---------------------------------------------------------------------------
  const publicCloudName = (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "").trim();
  const legacyCloudName = (process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  if (legacyCloudName && !publicCloudName) {
    issues.push({
      severity: "warning",
      code: "LEGACY_ENV_NAME",
      variable: "CLOUDINARY_CLOUD_NAME",
      message: "CLOUDINARY_CLOUD_NAME is deprecated; use NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME.",
    });
  } else if (legacyCloudName && publicCloudName && legacyCloudName !== publicCloudName) {
    issues.push({
      severity: "error",
      code: "INCONSISTENT_CLOUDINARY_CLOUD_NAME",
      variable: "CLOUDINARY_CLOUD_NAME",
      message:
        "CLOUDINARY_CLOUD_NAME conflicts with NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME. Remove legacy CLOUDINARY_CLOUD_NAME.",
    });
  }

  const cloudinaryCloudName = publicCloudName || legacyCloudName;
  const cloudinaryApiKey = (process.env.CLOUDINARY_API_KEY || "").trim();
  const cloudinaryApiSecret = (process.env.CLOUDINARY_API_SECRET || "").trim();

  if (
    ctx.isProduction &&
    ((cloudinaryCloudName && isMockTokenValue(cloudinaryCloudName)) ||
      (cloudinaryApiKey && isMockTokenValue(cloudinaryApiKey)) ||
      (cloudinaryApiSecret && isMockTokenValue(cloudinaryApiSecret)))
  ) {
    issues.push({
      severity: "error",
      code: "MOCK_CLOUDINARY_IN_PROD",
      variable: "CLOUDINARY_API_KEY",
      message: "Production environment cannot use demo or mock Cloudinary credentials.",
    });
  }

  const cloudinaryValidCreds =
    !isPlaceholderValue(cloudinaryCloudName) &&
    !isMockTokenValue(cloudinaryCloudName) &&
    !isPlaceholderValue(cloudinaryApiKey) &&
    !isMockTokenValue(cloudinaryApiKey) &&
    !isPlaceholderValue(cloudinaryApiSecret) &&
    !isMockTokenValue(cloudinaryApiSecret);

  if (enableCloudinary.value && !cloudinaryValidCreds) {
    issues.push({
      severity: "error",
      code: "CLOUDINARY_CREDENTIALS_INVALID",
      variable: "CLOUDINARY_API_KEY",
      message:
        "ENABLE_CLOUDINARY=true requires valid NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
    });
  }

  const cloudinaryMode = resolveServiceMode({
    flag: enableCloudinary,
    allowMockServices,
    ctx,
  });

  // ---------------------------------------------------------------------------
  // 4. Delhivery
  // ---------------------------------------------------------------------------
  const delhiveryToken = (process.env.DELHIVERY_TOKEN || "").trim();
  const delhiveryWebhookSecret = (process.env.DELHIVERY_WEBHOOK_SECRET || "").trim();
  const delhiveryApiUrlRaw = (
    process.env.DELHIVERY_API_URL ||
    (ctx.isProduction ? DELHIVERY_PRODUCTION_URL : DELHIVERY_STAGING_URL)
  )
    .trim()
    .replace(/\/+$/, "");
  const delhiveryPickupLocation = (
    process.env.DELHIVERY_PICKUP_LOCATION || "Primary Warehouse"
  ).trim();

  const parsedDelhiveryUrl = parseHttpUrl(delhiveryApiUrlRaw);
  const delhiveryIsProdEndpoint =
    parsedDelhiveryUrl?.origin.toLowerCase() === DELHIVERY_PRODUCTION_URL;
  const delhiveryIsStagingEndpoint =
    parsedDelhiveryUrl?.hostname.toLowerCase().includes("staging") ?? false;

  const delhiveryValidCreds =
    isValidDelhiveryTokenValue(delhiveryToken) &&
    Boolean(parsedDelhiveryUrl) &&
    parsedDelhiveryUrl?.protocol === "https:" &&
    (ctx.isProduction ? !delhiveryIsStagingEndpoint : !delhiveryIsProdEndpoint);

  if (enableDelhivery.value) {
    if (!parsedDelhiveryUrl || parsedDelhiveryUrl.protocol !== "https:") {
      issues.push({
        severity: "error",
        code: "INVALID_DELHIVERY_API_URL",
        variable: "DELHIVERY_API_URL",
        message: "ENABLE_DELHIVERY=true requires a valid HTTPS DELHIVERY_API_URL.",
      });
    }
    if (!ctx.isProduction && delhiveryIsProdEndpoint) {
      issues.push({
        severity: "error",
        code: "PROD_DELHIVERY_URL_IN_NON_PROD",
        variable: "DELHIVERY_API_URL",
        message: `Security violation: Production Delhivery endpoint (${DELHIVERY_PRODUCTION_URL}) cannot be enabled in "${ctx.appEnv}". Use ${DELHIVERY_STAGING_URL}.`,
      });
    }
    if (ctx.isProduction && delhiveryIsStagingEndpoint) {
      issues.push({
        severity: "error",
        code: "STAGING_DELHIVERY_URL_IN_PROD",
        variable: "DELHIVERY_API_URL",
        message: "Production environment cannot use a staging Delhivery API URL.",
      });
    }
    if (!isValidDelhiveryTokenValue(delhiveryToken)) {
      issues.push({
        severity: "error",
        code: "DELHIVERY_TOKEN_INVALID",
        variable: "DELHIVERY_TOKEN",
        message:
          "ENABLE_DELHIVERY=true requires a valid non-placeholder DELHIVERY_TOKEN (Delhivery is not configured).",
      });
    }
    if (isPlaceholderValue(delhiveryWebhookSecret) || isMockTokenValue(delhiveryWebhookSecret)) {
      issues.push({
        severity: "error",
        code: "DELHIVERY_WEBHOOK_SECRET_MISSING",
        variable: "DELHIVERY_WEBHOOK_SECRET",
        message: "ENABLE_DELHIVERY=true requires a valid DELHIVERY_WEBHOOK_SECRET.",
      });
    }
  } else if (!ctx.isProduction && delhiveryIsProdEndpoint && isValidDelhiveryTokenValue(delhiveryToken)) {
    issues.push({
      severity: "error",
      code: "LIVE_DELHIVERY_CONFIG_IN_NON_PROD",
      variable: "DELHIVERY_TOKEN",
      message: `Security violation: Production Delhivery token and URL detected in "${ctx.appEnv}" environment.`,
    });
  }

  const delhiveryMode = resolveServiceMode({
    flag: enableDelhivery,
    allowMockServices,
    ctx,
  });

  return {
    context: ctx,
    allowMockServices,
    services: {
      razorpay: {
        enabled: enableRazorpay.value,
        explicitFlag: enableRazorpay.explicit,
        mode: razorpayMode,
        isConfigured: razorpayValidCreds,
        operational: razorpayMode === "live" || razorpayMode === "sandbox" ? razorpayValidCreds : razorpayMode === "mock",
        keyId: razorpayKeyId,
        keySecret: razorpayKeySecret,
        webhookSecret: razorpayWebhookSecret,
      },
      emails: {
        enabled: enableEmails.value,
        explicitFlag: enableEmails.explicit,
        mode: emailsMode,
        isConfigured: resendValidCreds,
        operational: emailsMode === "live" || emailsMode === "sandbox" ? resendValidCreds : emailsMode === "mock",
        apiKey: resendApiKey,
        fromEmail: emailFrom,
        supportEmail: emailSupport,
        adminAlertEmail,
      },
      cloudinary: {
        enabled: enableCloudinary.value,
        explicitFlag: enableCloudinary.explicit,
        mode: cloudinaryMode,
        isConfigured: cloudinaryValidCreds,
        operational: cloudinaryMode === "live" || cloudinaryMode === "sandbox" ? cloudinaryValidCreds : cloudinaryMode === "mock",
        cloudName: cloudinaryCloudName,
        apiKey: cloudinaryApiKey,
        apiSecret: cloudinaryApiSecret,
      },
      delhivery: {
        enabled: enableDelhivery.value,
        explicitFlag: enableDelhivery.explicit,
        mode: delhiveryMode,
        isConfigured: delhiveryValidCreds,
        operational: delhiveryMode === "live" || delhiveryMode === "sandbox" ? delhiveryValidCreds : delhiveryMode === "mock",
        token: delhiveryToken,
        webhookSecret: delhiveryWebhookSecret,
        apiUrl: delhiveryApiUrlRaw,
        pickupLocation: delhiveryPickupLocation,
      },
    },
    issues,
  };
}

/**
 * Validates security, URL, OTP secret, and statutory business variables.
 */
function checkCoreAppAndBusinessEnv(
  ctx: ResolvedAppContext,
  options: ValidateServerEnvOptions,
  issues: EnvValidationIssue[]
): void {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (siteUrl) {
    const parsedSite = parseHttpUrl(siteUrl);
    if (!parsedSite) {
      issues.push({
        severity: "error",
        code: "INVALID_SITE_URL",
        variable: "NEXT_PUBLIC_SITE_URL",
        message: "NEXT_PUBLIC_SITE_URL / NEXT_PUBLIC_APP_URL must be a valid http:// or https:// URL.",
      });
    } else if (ctx.isProduction && (isLocalhostUrl(parsedSite) || parsedSite.protocol !== "https:")) {
      issues.push({
        severity: "error",
        code: "INSECURE_SITE_URL_IN_PROD",
        variable: "NEXT_PUBLIC_SITE_URL",
        message: "Production NEXT_PUBLIC_SITE_URL must be a valid HTTPS domain and not localhost.",
      });
    }
  } else if (ctx.isProduction && !process.env.VERCEL_URL) {
    issues.push({
      severity: "error",
      code: "MISSING_SITE_URL_IN_PROD",
      variable: "NEXT_PUBLIC_SITE_URL",
      message: "NEXT_PUBLIC_SITE_URL (or VERCEL_URL) must be configured in production.",
    });
  }

  const otpSecret = (process.env.DELIVERY_OTP_HMAC_SECRET || "").trim();
  if (ctx.isProduction || ctx.isPreviewOrStaging) {
    if (!otpSecret || isPlaceholderValue(otpSecret) || KNOWN_DEV_OTP_FALLBACK_SECRETS.has(otpSecret) || otpSecret.length < 16) {
      issues.push({
        severity: "error",
        code: "INVALID_OTP_HMAC_SECRET",
        variable: "DELIVERY_OTP_HMAC_SECRET",
        message: `DELIVERY_OTP_HMAC_SECRET must be set to a unique >= 16 character secret in ${ctx.appEnv}.`,
      });
    }
  }

  const cronSecret = (process.env.CRON_SECRET || "").trim();
  if (cronSecret) {
    if ((ctx.isProduction || ctx.isPreviewOrStaging) && (isPlaceholderValue(cronSecret) || cronSecret.length < 16)) {
      issues.push({
        severity: "error",
        code: "INVALID_CRON_SECRET",
        variable: "CRON_SECRET",
        message: `CRON_SECRET must be a valid non-placeholder secret (>= 16 chars) in ${ctx.appEnv}.`,
      });
    }
  } else if (ctx.isProduction) {
    issues.push({
      severity: "warning",
      code: "MISSING_CRON_SECRET_IN_PROD",
      variable: "CRON_SECRET",
      message: "CRON_SECRET is not configured; /api/cron/release-reservations will fail closed until configured.",
    });
  }

  if (ctx.isProduction && (options.requireBusinessConfigInProd ?? true)) {
    const gstin = (process.env.BUSINESS_GSTIN || "").trim();
    if (!isValidProductionGstin(gstin)) {
      issues.push({
        severity: "error",
        code: "INVALID_BUSINESS_GSTIN",
        variable: "BUSINESS_GSTIN",
        message:
          "Production requires a valid 15-character non-placeholder BUSINESS_GSTIN for statutory invoicing.",
      });
    }
  }
}

/**
 * Runs complete server environment validation and returns structured issues without exposing secret values.
 */
export function validateServerEnv(options: ValidateServerEnvOptions = {}): EnvValidationResult {
  assertServerContext("validateServerEnv");

  const integrations = resolveServerIntegrations({
    requireExplicitFlagsInProd: options.requireExplicitFlagsInProd,
  });
  const ctx = integrations.context;
  const issues: EnvValidationIssue[] = [...integrations.issues];

  checkSecretExposure(issues);
  checkSupabaseIsolation(ctx, options, issues);
  checkCoreAppAndBusinessEnv(ctx, options, issues);

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return {
    valid: errors.length === 0,
    appEnv: ctx.appEnv,
    nodeEnv: ctx.nodeEnv,
    vercelEnv: ctx.vercelEnv,
    errors,
    warnings,
  };
}

/**
 * Validates server environment and throws EnvironmentValidationError on any error.
 */
export function assertValidServerEnv(options: ValidateServerEnvOptions = {}): EnvValidationResult {
  const result = validateServerEnv(options);
  if (!result.valid) {
    const summary = result.errors
      .map((e) => `[${e.code}] (${e.variable}): ${e.message}`)
      .join("\n- ");
    throw new EnvironmentValidationError(
      `Environment validation failed for "${result.appEnv}":\n- ${summary}`,
      result.errors,
      result.appEnv
    );
  }
  return result;
}

/**
 * Startup validation hook invoked from Next.js instrumentation.
 * Skips build-only static phase when running local non-Vercel builds,
 * while strictly failing fast on live runtime startup or Vercel builds with invalid config.
 */
export function assertValidServerEnvOnStartup(): EnvValidationResult | null {
  assertServerContext("assertValidServerEnvOnStartup");

  const ctx = resolveAppEnvironment();
  if (ctx.isNextBuildPhase && !ctx.vercelEnv && !ctx.isProduction) {
    return null;
  }

  return assertValidServerEnv({
    requireServiceRole: ctx.isProduction,
    requireBusinessConfigInProd: ctx.isProduction,
    requireExplicitFlagsInProd: ctx.isProduction && !ctx.isNextBuildPhase,
  });
}

/**
 * Returns the HMAC secret used for delivery & phone OTP hashing.
 * Fails closed in production, preview, and staging if missing or using dev defaults.
 */
export function getOtpHmacSecret(): string {
  assertServerContext("getOtpHmacSecret");

  const ctx = resolveAppEnvironment();
  const configured = (process.env.DELIVERY_OTP_HMAC_SECRET || "").trim();

  if (configured && !isPlaceholderValue(configured)) {
    if ((ctx.isProduction || ctx.isPreviewOrStaging) && KNOWN_DEV_OTP_FALLBACK_SECRETS.has(configured)) {
      throw new Error(
        `Security violation: Development DELIVERY_OTP_HMAC_SECRET is prohibited in "${ctx.appEnv}".`
      );
    }
    return configured;
  }

  if (ctx.isLocalOrTestRuntime) {
    return "dev_only_local_otp_hmac_secret_do_not_use_in_prod";
  }

  throw new Error(
    `DELIVERY_OTP_HMAC_SECRET is required in "${ctx.appEnv}" environment (fail closed).`
  );
}

/**
 * Returns true ONLY when mock catalog fallback is explicitly permitted (local dev/test with ALLOW_MOCK_SERVICES=true).
 */
export function isMockCatalogAllowed(): boolean {
  assertServerContext("isMockCatalogAllowed");
  const snapshot = resolveServerIntegrations();
  return snapshot.allowMockServices && snapshot.context.isLocalOrTestRuntime;
}

/**
 * Returns true ONLY when test OTP exposure in API/action responses is strictly safe (local dev/test with ALLOW_MOCK_SERVICES=true or NODE_ENV=test).
 */
export function isMockOtpExposureAllowed(): boolean {
  assertServerContext("isMockOtpExposureAllowed");
  const ctx = resolveAppEnvironment();
  if (!ctx.isLocalOrTestRuntime) return false;
  if (ctx.nodeEnv === "test") return true;
  const allowMock = parseStrictBooleanEnv(process.env.ALLOW_MOCK_SERVICES, "ALLOW_MOCK_SERVICES", false);
  return allowMock.value;
}
