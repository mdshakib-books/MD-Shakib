import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTicketDetails } from "@/lib/support/tickets";

export async function GET(
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

    const isAdmin = profile?.role === "admin" || profile?.role === "super_admin" || profile?.role === "support_staff";
    const ticket = await getTicketDetails(id, user.id, isAdmin);

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found or unauthorized" }, { status: 404 });
    }

    return NextResponse.json({ ticket });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch ticket" }, { status: 500 });
  }
}
