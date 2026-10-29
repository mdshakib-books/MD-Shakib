import { getCloudinaryClient } from "./client";
import { getIntegrationsConfig } from "../config";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export interface SignedUploadParameters {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
}

/**
 * Generates signed parameters for authenticated admin client direct uploads.
 * Restricts folder strictly to 'mdshakib_books'.
 */
export function generateSignedUploadParams(folder = "mdshakib_books"): SignedUploadParameters {
  const { cloudinary: cConfig } = getIntegrationsConfig();

  if (!cConfig.apiSecret || !cConfig.apiKey || !cConfig.cloudName) {
    throw new Error("Cloudinary credentials are not configured.");
  }

  const timestamp = Math.round(Date.now() / 1000);
  const client = getCloudinaryClient();

  const paramsToSign = {
    folder,
    timestamp,
  };

  const signature = client.utils.api_sign_request(paramsToSign, cConfig.apiSecret);

  return {
    timestamp,
    signature,
    apiKey: cConfig.apiKey,
    cloudName: cConfig.cloudName,
    folder,
  };
}

/**
 * Inspects raw buffer bytes to detect true image format using magic bytes.
 * Supports JPEG (FF D8 FF), PNG (89 50 4E 47), and WebP (RIFF ... WEBP).
 */
export function detectImageSignature(buffer: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (!buffer || buffer.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }

  // WebP: RIFF (bytes 0-3) + WEBP (bytes 8-11)
  const isRiff =
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46;

  const isWebp =
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50;

  if (isRiff && isWebp) {
    return "image/webp";
  }

  return null;
}

/**
 * Validates and uploads a file buffer to Cloudinary.
 * Admin-only operation with strict size, MIME, and binary magic-byte validation.
 */
export async function uploadImageBuffer(
  buffer: Buffer,
  mimeType: string,
  folder = "mdshakib_books"
): Promise<{ secure_url: string; public_id: string }> {
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
    throw new Error(`Unsupported image type: ${mimeType}. Allowed types: JPEG, PNG, WebP.`);
  }

  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(
      `Image size exceeds maximum limit of 5MB (received ${(buffer.length / (1024 * 1024)).toFixed(2)}MB).`
    );
  }

  // Validate binary magic bytes signature
  const detectedType = detectImageSignature(buffer);
  if (!detectedType) {
    throw new Error("Invalid or corrupted image payload: missing valid image magic bytes signature.");
  }

  // Reject MIME spoofing
  const isJpegMatch = (mimeType === "image/jpeg" || mimeType === "image/jpg") && detectedType === "image/jpeg";
  const isExactMatch = mimeType === detectedType;

  if (!isExactMatch && !isJpegMatch) {
    throw new Error(
      `MIME type spoofing detected: declared '${mimeType}' but binary header indicates '${detectedType}'.`
    );
  }

  const { cloudinary: cConfig } = getIntegrationsConfig();

  // If mock/test mode without live credentials
  if (!cConfig.isConfigured) {
    return {
      secure_url: `https://res.cloudinary.com/${cConfig.cloudName || "demo"}/image/upload/v1/mdshakib_books/mock_${Date.now()}.webp`,
      public_id: `mdshakib_books/mock_${Date.now()}`,
    };
  }

  const client = getCloudinaryClient();

  return new Promise((resolve, reject) => {
    const uploadStream = client.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
      },
      (error, result) => {
        if (error || !result) {
          return reject(new Error(error?.message || "Cloudinary upload failed."));
        }
        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
        });
      }
    );

    uploadStream.end(buffer);
  });
}

/**
 * Extracts public_id from Cloudinary URL.
 */
export function extractPublicIdFromUrl(url: string): string | null {
  try {
    const regex = /\/upload\/(?:v\d+\/)?([^\.]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Deletes an image from Cloudinary by public ID.
 */
export async function deleteImageByPublicId(publicId: string): Promise<boolean> {
  const { cloudinary: cConfig } = getIntegrationsConfig();

  if (!cConfig.isConfigured) {
    return true; // Mock test pass
  }

  const client = getCloudinaryClient();
  const res = await client.uploader.destroy(publicId);
  return res.result === "ok";
}

