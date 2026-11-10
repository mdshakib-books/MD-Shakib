import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { importBooksFromCsv } from "@/lib/admin/catalog-io";

export async function POST(req: NextRequest) {
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

    const isStaff = ["admin", "super_admin", "warehouse_staff", "operations"].includes(profile?.role || "");
    if (!isStaff) {
      return NextResponse.json({ error: "Forbidden: Staff role required" }, { status: 403 });
    }

    let csvContent = "";
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No CSV file provided in upload." }, { status: 400 });
      }
      csvContent = await file.text();
    } else {
      const body = await req.json();
      csvContent = body.csvContent;
    }

    if (!csvContent || !csvContent.trim()) {
      return NextResponse.json({ error: "Empty CSV content provided." }, { status: 400 });
    }

    const result = await importBooksFromCsv(csvContent, user.id);

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Import failed" }, { status: 500 });
  }
}
