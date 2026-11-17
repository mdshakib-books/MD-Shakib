import crypto from "crypto";
import { Resend } from "resend";
import { getIntegrationsConfig, getServiceValidationErrors } from "../config";
import type { ServiceExecutionMode } from "@/lib/env/shared";

let resendInstance: Resend | null = null;
let cachedApiKeyFingerprint: string | null = null;

export class ResendConfigurationError extends Error {
  constructor(message = "Resend email credentials are missing or invalid on the server.") {
    super(message);
    this.name = "ResendConfigurationError";
  }
}

export class ResendDisabledError extends ResendConfigurationError {
  constructor(message = "Transactional email service is disabled (ENABLE_EMAILS=false).") {
    super(message);
    this.name = "ResendDisabledError";
  }
}

export function resolveResendExecution(): {
  mode: ServiceExecutionMode;
  config: ReturnType<typeof getIntegrationsConfig>["resend"];
  error?: string;
} {
  if (typeof window !== "undefined") {
    throw new Error("Resend email client cannot be used in browser context.");
  }

  const config = getIntegrationsConfig();
  const validationErrors = getServiceValidationErrors(config.snapshot, "emails");
  if (validationErrors.length > 0) {
    return {
      mode: config.resend.mode,
      config: config.resend,
      error: validationErrors[0],
    };
  }

  return {
    mode: config.resend.mode,
    config: config.resend,
  };
}

export function getResendClient(): Resend | null {
  const { mode, config, error } = resolveResendExecution();

  if (error || mode === "disabled" || mode === "mock" || !config.isConfigured) {
    return null;
  }

  const fingerprint = crypto.createHash("sha256").update(config.apiKey).digest("hex");
  if (!resendInstance || cachedApiKeyFingerprint !== fingerprint) {
    resendInstance = new Resend(config.apiKey);
    cachedApiKeyFingerprint = fingerprint;
  }

  return resendInstance;
}
