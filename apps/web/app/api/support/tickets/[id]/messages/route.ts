import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addTicketMessage } from "@/lib/support/tickets";

export async function POST(
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

    const isStaff = profile?.role === "admin" || profile?.role === "super_admin" || profile?.role === "support_staff";

    const body = await req.json();
    const { message, attachments } = body;

    const res = await addTicketMessage({
      ticketId: id,
      senderId: user.id,
      isStaff,
      message,
      attachments,
    });

    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to post message" }, { status: 500 });
  }
}
