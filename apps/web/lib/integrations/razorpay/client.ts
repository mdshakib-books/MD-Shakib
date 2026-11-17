import crypto from "crypto";
import Razorpay from "razorpay";
import { getIntegrationsConfig, getServiceValidationErrors } from "../config";
import type { ServiceExecutionMode } from "@/lib/env/shared";

let razorpayInstance: Razorpay | null = null;
let cachedCredentialFingerprint: string | null = null;

export class RazorpayConfigurationError extends Error {
  constructor(message = "Razorpay credentials are missing or invalid on the server.") {
    super(message);
    this.name = "RazorpayConfigurationError";
  }
}

export class RazorpayDisabledError extends RazorpayConfigurationError {
  constructor(
    message = "Razorpay payment service is disabled on the server (ENABLE_RAZORPAY=false)."
  ) {
    super(message);
    this.name = "RazorpayDisabledError";
  }
}

export function resolveRazorpayExecution(operation = "payment operation"): {
  mode: Exclude<ServiceExecutionMode, "disabled">;
  config: ReturnType<typeof getIntegrationsConfig>["razorpay"];
} {
  if (typeof window !== "undefined") {
    throw new Error("Razorpay client cannot be initialized in browser context.");
  }

  const config = getIntegrationsConfig();
  const validationErrors = getServiceValidationErrors(config.snapshot, "razorpay");
  if (validationErrors.length > 0) {
    throw new RazorpayConfigurationError(validationErrors[0]);
  }

  const { razorpay } = config;

  if (razorpay.mode === "disabled") {
    throw new RazorpayDisabledError(
      `Razorpay ${operation} is unavailable: Razorpay service is disabled (ENABLE_RAZORPAY=false).`
    );
  }

  if (razorpay.mode === "mock") {
    return { mode: "mock", config: razorpay };
  }

  if (!razorpay.isConfigured) {
    throw new RazorpayConfigurationError(
      `Razorpay ${operation} is unavailable: NEXT_PUBLIC_RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing or invalid.`
    );
  }

  return { mode: razorpay.mode, config: razorpay };
}

/**
 * Returns a server-side Razorpay SDK instance when enabled with valid credentials.
 * Throws RazorpayDisabledError when disabled and RazorpayConfigurationError when misconfigured or in mock mode.
 */
export function getRazorpayClient(): Razorpay {
  const { mode, config } = resolveRazorpayExecution("client initialization");

  if (mode === "mock") {
    throw new RazorpayConfigurationError(
      "Razorpay SDK client is not used in mock mode (ALLOW_MOCK_SERVICES=true)."
    );
  }

  const fingerprint = crypto
    .createHash("sha256")
    .update(`${config.keyId}:${config.keySecret}`)
    .digest("hex");

  if (!razorpayInstance || cachedCredentialFingerprint !== fingerprint) {
    razorpayInstance = new Razorpay({
      key_id: config.keyId,
      key_secret: config.keySecret,
    });
    // Enforce bounded network timeout on underlying HTTP client
    if ((razorpayInstance as any)?.api?.rq?.defaults) {
      (razorpayInstance as any).api.rq.defaults.timeout = 10000;
    }
    cachedCredentialFingerprint = fingerprint;
  }

  return razorpayInstance;
}
