import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addTicketMessage } from "@/lib/support/tickets";
import { hasPermission } from "@/lib/admin/permissions";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import {
  isValidUuid,
  NO_STORE_HEADERS,
  readBoundedJsonBody,
  serverErrorResponse,
} from "@/lib/security/http";

export async function POST(
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

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const rl = await checkRateLimit(`support:reply:${user.id}`, "api");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_blocked, is_deleted")
      .eq("id", user.id)
      .single();

    if (profile?.is_blocked || profile?.is_deleted) {
      return NextResponse.json(
        { error: "Account is not active." },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const isStaff = Boolean(profile && hasPermission(profile.role, "support.manage"));

    const parsedBody = await readBoundedJsonBody(req);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { error: parsedBody.error },
        { status: parsedBody.status, headers: NO_STORE_HEADERS }
      );
    }

    const { message, attachments } = parsedBody.data;

    const res = await addTicketMessage({
      ticketId: id,
      senderId: user.id,
      isStaff,
      message,
      attachments,
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
      "/api/support/tickets/[id]/messages",
      err,
      "Failed to post message.",
      req
    );
  }
}
