import { v2 as cloudinary } from "cloudinary";
import { getIntegrationsConfig } from "../config";

let isConfigured = false;

export function getCloudinaryClient() {
  if (typeof window !== "undefined") {
    throw new Error("Cloudinary SDK cannot be accessed on the client.");
  }

  const { cloudinary: cConfig } = getIntegrationsConfig();

  if (!isConfigured && cConfig.cloudName && cConfig.apiKey && cConfig.apiSecret) {
    cloudinary.config({
      cloud_name: cConfig.cloudName,
      api_key: cConfig.apiKey,
      api_secret: cConfig.apiSecret,
      secure: true,
    });
    isConfigured = true;
  }

  return cloudinary;
}

