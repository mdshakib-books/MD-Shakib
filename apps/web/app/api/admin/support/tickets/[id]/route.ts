import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminUpdateTicket } from "@/lib/support/tickets";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isStaff = ["admin", "super_admin", "support_staff", "operations"].includes(profile?.role || "");
    if (!isStaff) {
      return NextResponse.json({ error: "Forbidden: Staff permission required" }, { status: 403 });
    }

    const body = await req.json();
    const { status, priority, assignedTo, resolutionNotes } = body;

    const res = await adminUpdateTicket({
      ticketId: id,
      adminId: user.id,
      status,
      priority,
      assignedTo,
      resolutionNotes,
    });

    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update ticket" }, { status: 500 });
  }
}
