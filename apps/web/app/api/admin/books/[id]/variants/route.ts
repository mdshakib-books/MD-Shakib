import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBookVariants, createBookVariant } from "@/lib/catalog/variants";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const variants = await getBookVariants(id);
    return NextResponse.json({ variants });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load variants" }, { status: 500 });
  }
}

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

    const isStaff = ["admin", "super_admin", "warehouse_staff", "operations"].includes(profile?.role || "");
    if (!isStaff) {
      return NextResponse.json({ error: "Forbidden: Staff role required" }, { status: 403 });
    }

    const body = await req.json();
    const { title, sku, price, stock, variantType, variantValue, isActive } = body;

    const result = await createBookVariant({
      bookId: id,
      title,
      sku,
      price,
      stock,
      variantType,
      variantValue,
      isActive,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to create variant" }, { status: 500 });
  }
}
