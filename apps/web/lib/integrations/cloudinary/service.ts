import { v2 as cloudinarySdk } from "cloudinary";
import {
  CloudinaryConfigurationError,
  CloudinaryDisabledError,
  getCloudinaryClient,
  resolveCloudinaryExecution,
} from "./client";
import { logger } from "@/lib/logger";
import type { ServiceExecutionMode } from "@/lib/env/shared";

export { CloudinaryConfigurationError, CloudinaryDisabledError };

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const MIN_IMAGE_DIMENSION = 20; // px
export const MAX_IMAGE_DIMENSION = 6000; // px

export interface SignedUploadParameters {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
  mode?: Exclude<ServiceExecutionMode, "disabled">;
  isMock?: boolean;
}

/**
 * Generates signed parameters for authenticated admin client direct uploads.
 * Restricts folder strictly to the 'mdshakib_books' namespace.
 */
export function generateSignedUploadParams(folder = "mdshakib_books"): SignedUploadParameters {
  if (folder !== "mdshakib_books" && !folder.startsWith("mdshakib_books/")) {
    throw new Error("Security violation: Uploads are restricted strictly to the 'mdshakib_books' namespace.");
  }

  const { mode, config: cConfig } = resolveCloudinaryExecution("signed upload generation");
  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = {
    folder,
    timestamp,
  };

  if (mode === "mock") {
    const signature = cloudinarySdk.utils.api_sign_request(paramsToSign, "dev_only_mock_cloudinary_secret");
    logger.info("[MOCK][Cloudinary] Generated dev/test mock upload signature", {
      folder,
      mode: "mock",
    });
    return {
      timestamp,
      signature,
      apiKey: "mock_key",
      cloudName: cConfig.cloudName || "mock-demo",
      folder,
      mode: "mock",
      isMock: true,
    };
  }

  const client = getCloudinaryClient();
  const signature = client.utils.api_sign_request(paramsToSign, cConfig.apiSecret);

  return {
    timestamp,
    signature,
    apiKey: cConfig.apiKey,
    cloudName: cConfig.cloudName,
    folder,
    mode,
    isMock: false,
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
 * Extracts true width and height dimensions from raw image buffer headers.
 * Protects against decompression bombs and malformed geometry.
 */
export function getImageDimensions(
  buffer: Buffer,
  detectedType: "image/jpeg" | "image/png" | "image/webp"
): { width: number; height: number } | null {
  try {
    if (detectedType === "image/png") {
      if (buffer.length < 24) return null;
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }

    if (detectedType === "image/jpeg") {
      let offset = 2;
      while (offset < buffer.length - 8) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1];
        // SOF0 to SOF3 (baseline and progressive markers)
        if (marker >= 0xc0 && marker <= 0xc3) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }
        const length = buffer.readUInt16BE(offset + 2);
        offset += 2 + length;
      }
      return null;
    }

    if (detectedType === "image/webp") {
      if (buffer.length < 30) return null;
      const chunkType = buffer.toString("ascii", 12, 16);
      if (chunkType === "VP8X") {
        const width = 1 + buffer.readUIntLE(24, 3);
        const height = 1 + buffer.readUIntLE(27, 3);
        return { width, height };
      } else if (chunkType === "VP8 ") {
        const width = buffer.readUInt16LE(26) & 0x3fff;
        const height = buffer.readUInt16LE(28) & 0x3fff;
        return { width, height };
      }
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Validates and uploads a file buffer to Cloudinary.
 * Admin-only operation with strict size, MIME, binary magic-byte, and image dimension validation.
 */
export async function uploadImageBuffer(
  buffer: Buffer,
  mimeType: string,
  folder = "mdshakib_books"
): Promise<{
  secure_url: string;
  public_id: string;
  mode?: Exclude<ServiceExecutionMode, "disabled">;
  isMock?: boolean;
}> {
  if (folder !== "mdshakib_books" && !folder.startsWith("mdshakib_books/")) {
    throw new Error("Security violation: Target folder must reside within 'mdshakib_books'.");
  }

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

  // Enforce decoded dimensions and bounds
  const dimensions = getImageDimensions(buffer, detectedType);
  if (dimensions) {
    if (dimensions.width < MIN_IMAGE_DIMENSION || dimensions.height < MIN_IMAGE_DIMENSION) {
      throw new Error(
        `Image dimensions too small: ${dimensions.width}x${dimensions.height}px (minimum ${MIN_IMAGE_DIMENSION}x${MIN_IMAGE_DIMENSION}px required).`
      );
    }
    if (dimensions.width > MAX_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION) {
      throw new Error(
        `Image dimensions exceed maximum safe limit: ${dimensions.width}x${dimensions.height}px (maximum ${MAX_IMAGE_DIMENSION}x${MAX_IMAGE_DIMENSION}px allowed).`
      );
    }
  }

  const { mode, config: cConfig } = resolveCloudinaryExecution("image upload");

  if (mode === "mock") {
    const publicId = `mdshakib_books/mock_${Date.now()}`;
    logger.info("[MOCK][Cloudinary] Simulated image upload (no external API call)", {
      publicId,
      mode: "mock",
    });
    return {
      secure_url: `https://res.cloudinary.com/${cConfig.cloudName || "mock-demo"}/image/upload/v1/${publicId}.webp`,
      public_id: publicId,
      mode: "mock",
      isMock: true,
    };
  }

  const client = getCloudinaryClient();

  const CLOUDINARY_UPLOAD_TIMEOUT_MS = 15000;

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("Cloudinary upload timed out after 15000ms."));
      }
    }, CLOUDINARY_UPLOAD_TIMEOUT_MS);

    const uploadStream = client.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        timeout: CLOUDINARY_UPLOAD_TIMEOUT_MS,
      },
      (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        if (error || !result) {
          return reject(new Error(error?.message || "Cloudinary upload failed."));
        }

        // Validate returned Cloudinary metadata
        if (!result.secure_url || !result.secure_url.startsWith("https://res.cloudinary.com/")) {
          return reject(new Error("Cloudinary response validation failed: invalid secure_url protocol."));
        }

        if (!result.public_id || !result.public_id.startsWith("mdshakib_books")) {
          return reject(new Error("Cloudinary response validation failed: unexpected public_id namespace."));
        }

        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
          mode,
          isMock: false,
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
 * Strictly enforces that deletions are confined to the 'mdshakib_books' namespace.
 */
export async function deleteImageByPublicId(publicId: string): Promise<boolean> {
  if (!publicId || !publicId.startsWith("mdshakib_books/")) {
    throw new Error("Security violation: Deletions are restricted strictly to the 'mdshakib_books' namespace.");
  }

  const { mode } = resolveCloudinaryExecution("image deletion");

  if (mode === "mock") {
    logger.info("[MOCK][Cloudinary] Simulated image deletion (no external API call)", {
      publicId,
      mode: "mock",
    });
    return true;
  }

  const client = getCloudinaryClient();
  const res = await client.uploader.destroy(publicId);
  return res.result === "ok";
}
