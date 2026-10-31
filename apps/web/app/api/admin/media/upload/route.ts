import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadImageBuffer } from "@/lib/integrations/cloudinary/service";

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

    // Verify active admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_blocked, is_deleted")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin" || profile?.is_blocked || profile?.is_deleted) {
      return NextResponse.json(
        { error: "Forbidden: Active administrator privileges required." },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "mdshakib_books";

    if (folder !== "mdshakib_books" && !folder.startsWith("mdshakib_books/")) {
      return NextResponse.json(
        { error: "Invalid target folder: uploads are restricted strictly to 'mdshakib_books'." },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json({ error: "No file provided in form data." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await uploadImageBuffer(buffer, file.type, folder);

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to upload media file." },
      { status: 400 }
    );
  }
}

