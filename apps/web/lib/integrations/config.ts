/**
 * Centralized Integration Configuration, Kill Switches, and Environment Guardrails.
 *
 * Strictly server-only. Controls execution modes ("disabled" | "mock" | "sandbox" | "live")
 * for Razorpay, Resend, Cloudinary, and Delhivery.
 */

import {
  assertServerContext,
  isValidDelhiveryTokenValue,
  resolveAppEnvironment,
  resolveServerIntegrations,
  type ResolvedIntegrationsSnapshot,
} from "@/lib/env/server";
import type { ServiceExecutionMode, ServiceKey } from "@/lib/env/shared";

export interface ServiceStatusDetail {
  enabled: boolean;
  configured: boolean;
  operational: boolean;
  mode: ServiceExecutionMode;
}

export interface IntegrationStatus {
  appEnv: string;
  allowMockServices: boolean;
  razorpay: ServiceStatusDetail & {
    hasKeyId: boolean;
    hasKeySecret: boolean;
    hasWebhookSecret: boolean;
  };
  resend: ServiceStatusDetail & {
    hasApiKey: boolean;
    fromEmail: string;
  };
  cloudinary: ServiceStatusDetail & {
    hasCloudName: boolean;
    hasApiKey: boolean;
    hasApiSecret: boolean;
  };
  delhivery: ServiceStatusDetail & {
    hasToken: boolean;
    hasWebhookSecret: boolean;
    apiUrl: string;
  };
}

/**
 * Checks whether a Delhivery API token is present and not a mock or template placeholder.
 */
export function isValidDelhiveryToken(token: string): boolean {
  return isValidDelhiveryTokenValue(token);
}

/**
 * Returns true only when runtime and APP_ENV explicitly indicate local development or automated tests.
 */
export function isExplicitNonProductionEnv(): boolean {
  assertServerContext("isExplicitNonProductionEnv");
  return resolveAppEnvironment().isLocalOrTestRuntime;
}

/**
 * Returns full resolved integration settings and kill-switch execution modes.
 */
export function getIntegrationsConfig() {
  assertServerContext("getIntegrationsConfig");
  const snapshot = resolveServerIntegrations();
  const { services, allowMockServices, context, issues } = snapshot;

  return {
    appEnv: context.appEnv,
    isProduction: context.isProduction,
    isLocalOrTestRuntime: context.isLocalOrTestRuntime,
    allowMockServices,
    issues,
    razorpay: {
      keyId: services.razorpay.keyId,
      keySecret: services.razorpay.keySecret,
      webhookSecret: services.razorpay.webhookSecret,
      enabled: services.razorpay.enabled,
      mode: services.razorpay.mode,
      isConfigured: services.razorpay.isConfigured,
      operational: services.razorpay.operational,
      allowMock: services.razorpay.mode === "mock",
    },
    resend: {
      apiKey: services.emails.apiKey,
      fromEmail: services.emails.fromEmail,
      supportEmail: services.emails.supportEmail,
      adminAlertEmail: services.emails.adminAlertEmail,
      enabled: services.emails.enabled,
      mode: services.emails.mode,
      isConfigured: services.emails.isConfigured,
      operational: services.emails.operational,
      allowMock: services.emails.mode === "mock",
    },
    cloudinary: {
      cloudName: services.cloudinary.cloudName,
      apiKey: services.cloudinary.apiKey,
      apiSecret: services.cloudinary.apiSecret,
      enabled: services.cloudinary.enabled,
      mode: services.cloudinary.mode,
      isConfigured: services.cloudinary.isConfigured,
      operational: services.cloudinary.operational,
      allowMock: services.cloudinary.mode === "mock",
    },
    delhivery: {
      token: services.delhivery.token,
      webhookSecret: services.delhivery.webhookSecret,
      apiUrl: services.delhivery.apiUrl,
      pickupLocation: services.delhivery.pickupLocation,
      enabled: services.delhivery.enabled,
      mode: services.delhivery.mode,
      isConfigured: services.delhivery.isConfigured,
      operational: services.delhivery.operational,
      allowMock: services.delhivery.mode === "mock",
    },
    snapshot,
  };
}

/**
 * Returns non-secret readiness status for health checks and admin UI panels.
 */
export function checkIntegrationStatus(): IntegrationStatus {
  const config = getIntegrationsConfig();

  return {
    appEnv: config.appEnv,
    allowMockServices: config.allowMockServices,
    razorpay: {
      enabled: config.razorpay.enabled,
      configured: config.razorpay.isConfigured,
      operational: config.razorpay.operational,
      mode: config.razorpay.mode,
      hasKeyId: Boolean(config.razorpay.keyId),
      hasKeySecret: Boolean(config.razorpay.keySecret),
      hasWebhookSecret: Boolean(config.razorpay.webhookSecret),
    },
    resend: {
      enabled: config.resend.enabled,
      configured: config.resend.isConfigured,
      operational: config.resend.operational,
      mode: config.resend.mode,
      hasApiKey: Boolean(config.resend.apiKey),
      fromEmail: config.resend.fromEmail,
    },
    cloudinary: {
      enabled: config.cloudinary.enabled,
      configured: config.cloudinary.isConfigured,
      operational: config.cloudinary.operational,
      mode: config.cloudinary.mode,
      hasCloudName: Boolean(config.cloudinary.cloudName),
      hasApiKey: Boolean(config.cloudinary.apiKey),
      hasApiSecret: Boolean(config.cloudinary.apiSecret),
    },
    delhivery: {
      enabled: config.delhivery.enabled,
      configured: config.delhivery.isConfigured,
      operational: config.delhivery.operational,
      mode: config.delhivery.mode,
      hasToken: Boolean(config.delhivery.token),
      hasWebhookSecret: Boolean(config.delhivery.webhookSecret),
      apiUrl: config.delhivery.apiUrl,
    },
  };
}

const SERVICE_ISSUE_CODES: Record<ServiceKey, Set<string>> = {
  razorpay: new Set([
    "MOCK_SERVICES_FORBIDDEN",
    "INVALID_BOOLEAN_FLAG",
    "LIVE_RAZORPAY_KEY_IN_NON_PROD",
    "TEST_RAZORPAY_KEY_IN_PROD",
    "INVALID_RAZORPAY_SECRET_FORMAT",
    "INCONSISTENT_RAZORPAY_KEY_ID",
    "RAZORPAY_CREDENTIALS_INVALID",
    "RAZORPAY_WEBHOOK_SECRET_MISSING",
  ]),
  emails: new Set([
    "MOCK_SERVICES_FORBIDDEN",
    "INVALID_BOOLEAN_FLAG",
    "TEST_RESEND_KEY_IN_PROD",
    "RESEND_CREDENTIALS_INVALID",
    "INVALID_EMAIL_FROM",
  ]),
  cloudinary: new Set([
    "MOCK_SERVICES_FORBIDDEN",
    "INVALID_BOOLEAN_FLAG",
    "MOCK_CLOUDINARY_IN_PROD",
    "INCONSISTENT_CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_CREDENTIALS_INVALID",
  ]),
  delhivery: new Set([
    "MOCK_SERVICES_FORBIDDEN",
    "INVALID_BOOLEAN_FLAG",
    "INVALID_DELHIVERY_API_URL",
    "PROD_DELHIVERY_URL_IN_NON_PROD",
    "STAGING_DELHIVERY_URL_IN_PROD",
    "DELHIVERY_TOKEN_INVALID",
    "DELHIVERY_WEBHOOK_SECRET_MISSING",
    "LIVE_DELHIVERY_CONFIG_IN_NON_PROD",
  ]),
};

/**
 * Returns any security/configuration error messages affecting a specific integration.
 */
export function getServiceValidationErrors(
  snapshot: ResolvedIntegrationsSnapshot,
  service: ServiceKey
): string[] {
  const relevantCodes = SERVICE_ISSUE_CODES[service];
  return snapshot.issues
    .filter((issue) => issue.severity === "error" && relevantCodes.has(issue.code))
    .map((issue) => issue.message);
}
