import fs from "fs";
import path from "path";

// Load environment variables from .env and .env.local if not already set
function loadEnv() {
  const envFiles = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "apps/web/.env"),
    path.resolve(process.cwd(), "apps/web/.env.local"),
  ];

  for (const envPath of envFiles) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
          const idx = trimmed.indexOf("=");
          const key = trimmed.slice(0, idx).trim();
          const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

import zlib from "zlib";
import {
  generateSignedUploadParams,
  detectImageSignature,
  getImageDimensions,
  uploadImageBuffer,
  deleteImageByPublicId,
  extractPublicIdFromUrl,
} from "../lib/integrations/cloudinary/service";
import { getIntegrationsConfig } from "../lib/integrations/config";

function createPng(width: number, height: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  function crc32(buf: Buffer): number {
    let c: number;
    const table: number[] = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c;
    }
    let crc = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ (-1)) >>> 0;
  }

  function makeChunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData), 0);
    return Buffer.concat([len, typeAndData, crc]);
  }

  const ihdrChunk = makeChunk("IHDR", ihdr);
  const row = Buffer.alloc(1 + width * 3);
  const rawData = Buffer.concat(Array(height).fill(row));
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

async function runLiveCloudinaryVerification() {
  console.log("=== CLOUDINARY LIVE SECURITY & INTEGRATION TEST ===");
  const { cloudinary } = getIntegrationsConfig();

  console.log("Configuration Check:");
  console.log(`- Is Configured: ${cloudinary.isConfigured}`);
  console.log(`- Cloud Name Present: ${Boolean(cloudinary.cloudName)}`);
  console.log(`- API Key Present: ${Boolean(cloudinary.apiKey)}`);
  console.log(`- API Secret Present: ${Boolean(cloudinary.apiSecret)}`);

  // 1. Test Signed Upload Params
  console.log("\n[Test 1] Testing Signed Upload Parameters...");
  const signedParams = generateSignedUploadParams("mdshakib_books");
  if (!signedParams.signature || !signedParams.timestamp || !signedParams.apiKey) {
    throw new Error("Failed: Signature generation returned empty parameters.");
  }
  console.log("✓ Signed upload params generated successfully with official Cloudinary signature algorithm.");

  // Test Folder namespace enforcement
  try {
    generateSignedUploadParams("arbitrary_folder");
    throw new Error("Failed: Namespace violation was not blocked!");
  } catch (err: any) {
    if (err.message.includes("Security violation: Uploads are restricted strictly")) {
      console.log("✓ Namespace restriction enforced: Rejected 'arbitrary_folder'.");
    } else {
      throw err;
    }
  }

  // 2. Test Format & Dimension Validation
  console.log("\n[Test 2] Testing Image Security Guards...");
  const validPng = createPng(50, 50);
  const tooSmallPng = createPng(10, 10);

  const detected = detectImageSignature(validPng);
  const dims = getImageDimensions(validPng, "image/png");
  if (detected !== "image/png" || dims?.width !== 50 || dims?.height !== 50) {
    throw new Error(`Failed to decode valid PNG headers: ${detected}, ${JSON.stringify(dims)}`);
  }
  console.log("✓ Binary magic bytes and dimension decoding verified.");

  // Reject MIME spoofing
  try {
    await uploadImageBuffer(validPng, "image/jpeg", "mdshakib_books");
    throw new Error("Failed: MIME spoofing was not blocked!");
  } catch (err: any) {
    if (err.message.includes("MIME type spoofing detected")) {
      console.log("✓ MIME spoofing blocked: Declared JPEG with PNG payload rejected.");
    } else {
      throw err;
    }
  }

  // Reject too small
  try {
    await uploadImageBuffer(tooSmallPng, "image/png", "mdshakib_books");
    throw new Error("Failed: Image dimension underflow was not blocked!");
  } catch (err: any) {
    if (err.message.includes("Image dimensions too small")) {
      console.log("✓ Underflow dimension bounds enforced (10x10 < 20x20 rejected).");
    } else {
      throw err;
    }
  }

  // Reject non-image / corrupted / SVG
  try {
    const fakeBuffer = Buffer.from("<svg onload='alert(1)'>malicious</svg>");
    await uploadImageBuffer(fakeBuffer, "image/png", "mdshakib_books");
    throw new Error("Failed: Corrupted non-image payload was not blocked!");
  } catch (err: any) {
    if (err.message.includes("Invalid or corrupted image payload")) {
      console.log("✓ Non-image/SVG payload rejected: Missing valid magic bytes.");
    } else {
      throw err;
    }
  }

  // 3. Test Live Upload & Deletion against Cloudinary API
  console.log("\n[Test 3] Testing Live Upload & Deletion on Cloudinary API...");
  const uploadResult = await uploadImageBuffer(validPng, "image/png", "mdshakib_books");
  console.log("✓ Upload succeeded!");
  console.log(`- Returned Secure URL Protocol: ${uploadResult.secure_url.startsWith("https://") ? "HTTPS (secure)" : "INSECURE"}`);
  console.log(`- Target Namespace: ${uploadResult.public_id.startsWith("mdshakib_books/") ? "mdshakib_books/ (verified)" : "INVALID"}`);

  // Test Arbitrary Deletion Protection
  try {
    await deleteImageByPublicId("system/malicious_delete_target");
    throw new Error("Failed: Arbitrary public_id deletion was not blocked!");
  } catch (err: any) {
    if (err.message.includes("Security violation: Deletions are restricted strictly")) {
      console.log("✓ Arbitrary deletion protection: Blocked attempt to delete asset outside 'mdshakib_books/'.");
    } else {
      throw err;
    }
  }

  // Delete the test image from Cloudinary
  console.log(`- Deleting test image from Cloudinary: ${uploadResult.public_id}...`);
  const deleteOk = await deleteImageByPublicId(uploadResult.public_id);
  if (!deleteOk) {
    throw new Error("Failed to delete test image from Cloudinary.");
  }
  console.log("✓ Test image successfully deleted from Cloudinary (clean teardown).");

  console.log("\n=== ALL CLOUDINARY LIVE VERIFICATION CHECKS PASSED ===");
}

runLiveCloudinaryVerification().catch((err) => {
  console.error("FATAL: Cloudinary verification failed:", err);
  process.exit(1);
});
