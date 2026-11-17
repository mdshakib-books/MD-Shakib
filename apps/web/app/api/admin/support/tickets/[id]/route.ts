import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin/auth";
import { adminUpdateTicket } from "@/lib/support/tickets";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import {
  isValidUuid,
  NO_STORE_HEADERS,
  readBoundedJsonBody,
  serverErrorResponse,
} from "@/lib/security/http";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!isValidUuid(id)) {
      return NextResponse.json(
        { error: "Invalid ticket ID format" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const auth = await verifyAdminApi("support.manage");
    if (!auth.authorized) {
      return auth.response;
    }

    const rl = await checkRateLimit(`admin:support-update:${auth.user.id}`, "admin");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const parsedBody = await readBoundedJsonBody(req);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { error: parsedBody.error },
        { status: parsedBody.status, headers: NO_STORE_HEADERS }
      );
    }

    const { status, priority, assignedTo, resolutionNotes } = parsedBody.data;
    if (assignedTo && !isValidUuid(assignedTo)) {
      return NextResponse.json(
        { error: "Invalid assignedTo user ID format" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const res = await adminUpdateTicket({
      ticketId: id,
      adminId: auth.user.id,
      status,
      priority,
      assignedTo,
      resolutionNotes,
    });

    if (!res.success) {
      return NextResponse.json(
        { error: res.error },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(res, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    return serverErrorResponse(
      "/api/admin/support/tickets/[id]",
      err,
      "Failed to update ticket.",
      req
    );
  }
}
