import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin/auth";
import { adminReviewReturnRequest } from "@/lib/commerce/returns";
import { hasPermission } from "@/lib/admin/permissions";

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminApi();
    if (!auth.authorized) {
      return auth.response;
    }

    if (!hasPermission(auth.profile.role, "orders.manage")) {
      return NextResponse.json({ error: "Forbidden: Return management permission required." }, { status: 403 });
    }

    const body = await req.json();
    const { returnId, action, rejectionReason, adminNotes } = body;

    if (!returnId || !action) {
      return NextResponse.json({ error: "returnId and action are required." }, { status: 400 });
    }

    const result = await adminReviewReturnRequest({
      returnId,
      adminId: auth.profile.id,
      action,
      rejectionReason,
      adminNotes,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Admin return review error:", err?.message || err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
