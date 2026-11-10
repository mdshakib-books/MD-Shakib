import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { anonymizeCustomerAccount } from "@/lib/commerce/account";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { confirmation } = body;

    if (confirmation !== "DELETE MY ACCOUNT") {
      return NextResponse.json(
        { error: 'Confirmation string must exactly match "DELETE MY ACCOUNT".' },
        { status: 400 }
      );
    }

    const res = await anonymizeCustomerAccount(user.id);
    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    // Sign out user session
    await supabase.auth.signOut();

    return NextResponse.json({ success: true, message: "Account successfully anonymized." });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to anonymize account" }, { status: 500 });
  }
}
