import crypto from "crypto";
import { v2 as cloudinary } from "cloudinary";
import { getIntegrationsConfig, getServiceValidationErrors } from "../config";
import type { ServiceExecutionMode } from "@/lib/env/shared";

let configuredFingerprint: string | null = null;

export class CloudinaryConfigurationError extends Error {
  constructor(message = "Cloudinary credentials are missing or invalid on the server.") {
    super(message);
    this.name = "CloudinaryConfigurationError";
  }
}

export class CloudinaryDisabledError extends CloudinaryConfigurationError {
  constructor(
    message = "Cloudinary media service is disabled on the server (ENABLE_CLOUDINARY=false)."
  ) {
    super(message);
    this.name = "CloudinaryDisabledError";
  }
}

export function resolveCloudinaryExecution(operation = "media operation"): {
  mode: Exclude<ServiceExecutionMode, "disabled">;
  config: ReturnType<typeof getIntegrationsConfig>["cloudinary"];
} {
  if (typeof window !== "undefined") {
    throw new Error("Cloudinary SDK cannot be accessed on the client.");
  }

  const config = getIntegrationsConfig();
  const validationErrors = getServiceValidationErrors(config.snapshot, "cloudinary");
  if (validationErrors.length > 0) {
    throw new CloudinaryConfigurationError(validationErrors[0]);
  }

  const { cloudinary: cConfig } = config;

  if (cConfig.mode === "disabled") {
    if (config.isProduction) {
      throw new CloudinaryDisabledError(
        `Production configuration error: Cloudinary is disabled or not configured. Cannot perform ${operation} in production.`
      );
    }
    throw new CloudinaryDisabledError(
      `Cloudinary ${operation} is unavailable: Cloudinary service is disabled (ENABLE_CLOUDINARY=false).`
    );
  }

  if (cConfig.mode === "mock") {
    return { mode: "mock", config: cConfig };
  }

  if (!cConfig.isConfigured) {
    throw new CloudinaryConfigurationError(
      `Cloudinary ${operation} is unavailable: NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET is missing or invalid.`
    );
  }

  return { mode: cConfig.mode, config: cConfig };
}

export function getCloudinaryClient() {
  const { mode, config: cConfig } = resolveCloudinaryExecution("client initialization");

  if (mode !== "mock" && cConfig.isConfigured) {
    const fingerprint = crypto
      .createHash("sha256")
      .update(`${cConfig.cloudName}:${cConfig.apiKey}:${cConfig.apiSecret}`)
      .digest("hex");

    if (configuredFingerprint !== fingerprint) {
      cloudinary.config({
        cloud_name: cConfig.cloudName,
        api_key: cConfig.apiKey,
        api_secret: cConfig.apiSecret,
        secure: true,
      });
      configuredFingerprint = fingerprint;
    }
  }

  return cloudinary;
}
