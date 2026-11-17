import { NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin/auth";
import {
  CloudinaryConfigurationError,
  CloudinaryDisabledError,
  MAX_IMAGE_SIZE_BYTES,
  uploadImageBuffer,
} from "@/lib/integrations/cloudinary/service";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import { NO_STORE_HEADERS, sanitizeClientErrorMessage } from "@/lib/security/http";

export async function POST(req: Request) {
  try {
    const auth = await verifyAdminApi("books.manage");
    if (!auth.authorized) {
      return auth.response;
    }

    const rl = await checkRateLimit(`admin:media-upload:${auth.user.id}`, "admin");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "mdshakib_books";

    if (folder !== "mdshakib_books" && !folder.startsWith("mdshakib_books/")) {
      return NextResponse.json(
        { error: "Invalid target folder: uploads are restricted strictly to 'mdshakib_books'." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!file) {
      return NextResponse.json(
        { error: "No file provided in form data." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (file.size <= 0 || file.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `Image file size must be between 1 byte and ${Math.round(MAX_IMAGE_SIZE_BYTES / (1024 * 1024))}MB.`,
        },
        { status: 413, headers: NO_STORE_HEADERS }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await uploadImageBuffer(buffer, file.type, folder);

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    if (error instanceof CloudinaryDisabledError || error instanceof CloudinaryConfigurationError) {
      return NextResponse.json(
        { configured: false, error: error.message },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: sanitizeClientErrorMessage(error, "Failed to upload media file.") },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}
