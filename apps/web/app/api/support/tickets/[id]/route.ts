import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTicketDetails } from "@/lib/support/tickets";
import { hasPermission } from "@/lib/admin/permissions";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import { isValidUuid, NO_STORE_HEADERS, serverErrorResponse } from "@/lib/security/http";

export async function GET(
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

    const rl = await checkRateLimit(`support:detail:${user.id}`, "api");
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
    const ticket = await getTicketDetails(id, user.id, isStaff);

    if (!ticket) {
      return NextResponse.json(
        { error: "Ticket not found or unauthorized" },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json({ ticket }, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    return serverErrorResponse("/api/support/tickets/[id]", err, "Failed to fetch ticket.", req);
  }
}
