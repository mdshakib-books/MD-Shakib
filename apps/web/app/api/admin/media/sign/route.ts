import { NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin/auth";
import {
  CloudinaryConfigurationError,
  CloudinaryDisabledError,
  generateSignedUploadParams,
} from "@/lib/integrations/cloudinary/service";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import {
  NO_STORE_HEADERS,
  readBoundedJsonBody,
  sanitizeClientErrorMessage,
} from "@/lib/security/http";

export async function POST(req: Request) {
  try {
    const auth = await verifyAdminApi("books.manage");
    if (!auth.authorized) {
      return auth.response;
    }

    const rl = await checkRateLimit(`admin:media-sign:${auth.user.id}`, "admin");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const parsedBody = await readBoundedJsonBody(req, 16 * 1024);
    const folder =
      (parsedBody.ok ? parsedBody.data?.folder : undefined) || "mdshakib_books";

    if (
      typeof folder !== "string" ||
      (folder !== "mdshakib_books" && !folder.startsWith("mdshakib_books/"))
    ) {
      return NextResponse.json(
        { error: "Invalid target folder: uploads are restricted strictly to 'mdshakib_books'." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const params = generateSignedUploadParams(folder);
    return NextResponse.json(params, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    if (error instanceof CloudinaryDisabledError || error instanceof CloudinaryConfigurationError) {
      return NextResponse.json(
        { configured: false, error: error.message },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: sanitizeClientErrorMessage(error, "Failed to generate upload signature.") },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}
