import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exportCustomersToCsv } from "@/lib/admin/reports";
import { hasPermission } from "@/lib/admin/permissions";

export async function GET(req: NextRequest) {
  try {
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

    if (!hasPermission(profile?.role || "user", "customers.export")) {
      return NextResponse.json({ error: "Forbidden: customers.export permission required" }, { status: 403 });
    }

    const csvData = await exportCustomersToCsv();

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="md-shakib-customers-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Export failed" }, { status: 500 });
  }
}
