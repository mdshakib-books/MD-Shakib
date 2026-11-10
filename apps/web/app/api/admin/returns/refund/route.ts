import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin/auth";
import { processReturnRefund } from "@/lib/commerce/returns";
import { hasPermission } from "@/lib/admin/permissions";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminApi();
    if (!auth.authorized) {
      return auth.response;
    }

    if (!hasPermission(auth.profile.role, "orders.manage")) {
      return NextResponse.json({ error: "Forbidden: Refund authorization permission required." }, { status: 403 });
    }

    const body = await req.json();
    const { returnId, amount, reason } = body;

    if (!returnId) {
      return NextResponse.json({ error: "returnId is required." }, { status: 400 });
    }

    const result = await processReturnRefund({
      returnId,
      adminId: auth.profile.id,
      amount: amount ? Number(amount) : undefined,
      reason,
    });

    if (!result.success) {
      logger.alert("HIGH", "Return Refund Failed", result.error || "Refund processing error", {
        returnId,
        adminId: auth.profile.id,
      });
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    logger.alert("CRITICAL", "Return Refund Uncaught Exception", err?.message || String(err), {}, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
