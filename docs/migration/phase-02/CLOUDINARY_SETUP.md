# PHASE 02 — CLOUDINARY MEDIA INTEGRATION & ASSET MANAGEMENT
## Architecture, Security Controls, and Verification

**Integration Target:** Cloudinary Media Cloud  
**Folder Namespace:** `mdshakib_books`  
**Max File Size:** 5 MB  
**Allowed Image Formats:** JPEG (`image/jpeg`), PNG (`image/png`), WebP (`image/webp`)  
**Date:** 2026-10-31  

---

## 1. Overview

Cloudinary is the authoritative media storage engine for book covers, sample interior pages, and marketing banners in MD Shakib Islamic Books. 

The integration supports dual-mode operation:
1. **Direct Signed Client Uploads:** Authenticated administrators fetch cryptographic signature parameters via `/api/admin/media/sign` and upload directly from the browser to Cloudinary without streaming high-resolution bytes through the Next.js server.
2. **Server Buffer Upload Fallback:** Administrative API `/api/admin/media/upload` accepts `multipart/form-data`, validates magic bytes on the server, and uploads via `cloudinary.uploader.upload_stream`.
3. **Local / Test Mock Fallback:** When credentials are unconfigured or running in test suites, mock image URLs are generated with zero downtime or external network dependencies.

---

## 2. Environment Configuration

The following environment variables are required for live Cloudinary synchronization:

```env
# Cloudinary Credentials (Server-side)
CLOUDINARY_CLOUD_NAME=dpbnffgow
CLOUDINARY_API_KEY=824699199341643
CLOUDINARY_API_SECRET=m5YiqyOt3LlHs19rqxIntTu2L8k

# Client-side (Optional public display)
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=dpbnffgow
```

---

## 3. Cryptographic Signature Generation (`/api/admin/media/sign`)

To prevent unauthorized uploads to the Cloudinary account, client direct uploads require a signed payload generated using the API secret.

```typescript
// apps/web/lib/integrations/cloudinary/service.ts
export function generateSignedUploadParams(folder = "mdshakib_books"): SignedUploadParameters {
  const { cloudinary: cConfig } = getIntegrationsConfig();

  if (!cConfig.apiSecret || !cConfig.apiKey || !cConfig.cloudName) {
    throw new Error("Cloudinary credentials are not configured.");
  }

  const timestamp = Math.round(Date.now() / 1000);
  const client = getCloudinaryClient();

  const paramsToSign = { folder, timestamp };
  const signature = client.utils.api_sign_request(paramsToSign, cConfig.apiSecret);

  return {
    timestamp,
    signature,
    apiKey: cConfig.apiKey,
    cloudName: cConfig.cloudName,
    folder,
  };
}
```

The route `/api/admin/media/sign` is strictly guarded by Supabase RBAC; non-admin users receive `403 Forbidden`.

---

## 4. Deep Inspection & Binary Magic-Byte Security

Relying on file extensions or user-provided `Content-Type` headers creates severe vulnerabilities (e.g. polyglot file uploads, HTML/SVG XSS payloads).

The integration implements strict binary magic-byte detection in `detectImageSignature`:

| Format | Magic Bytes (Hexadecimal) | Validation Logic |
|---|---|---|
| **JPEG** | `FF D8 FF` | `buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff` |
| **PNG** | `89 50 4E 47` | `buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47` |
| **WebP** | `RIFF ... WEBP` | Bytes 0-3 `52 49 46 46` (`RIFF`) and Bytes 8-11 `57 45 42 50` (`WEBP`) |

Payloads with mismatched MIME types (e.g., an HTML file named `cover.jpg`) are rejected before contacting Cloudinary.

---

## 5. UI Component: `MediaUploader.tsx`

Located at [`apps/web/components/admin/MediaUploader.tsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/apps/web/components/admin/MediaUploader.tsx):
- Drag-and-drop / file selection.
- Client pre-validation: rejects files > 5MB and unsupported MIME types immediately.
- Multiple image upload support (up to 6 images).
- Dynamic cover selection ("Set as Cover" badge).
- Image removal and thumbnail preview.

