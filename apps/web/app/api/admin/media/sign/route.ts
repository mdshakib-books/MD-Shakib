import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateSignedUploadParams } from "@/lib/integrations/cloudinary/service";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Admin privileges required." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const folder = body?.folder || "mdshakib_books";

    const params = generateSignedUploadParams(folder);
    return NextResponse.json(params);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to generate upload signature." },
      { status: 400 }
    );
  }
}

